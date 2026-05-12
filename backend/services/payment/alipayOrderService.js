const { getPool } = require('../../config/database');
const paymentConfig = require('../../config/payment');
const repository = require('../../repositories/paymentRepository');
const {
  buildAlipayPagePayPayload,
  normalizeAlipayBuyerId,
  requestAlipayTradeQuery,
  verifyAlipayNotifyParams
} = require('./alipay');
const { handlePaidOrder } = require('./paymentFulfillmentService');
const { buildOrderProductSnapshot } = require('./paymentProductService');
const { acquireUserClaim, buildPromotionClaimPurpose, releaseClaims } = require('./paymentClaimService');
const {
  createOrderNo,
  addMinutes,
  toMysqlDateTime,
  parseAlipayPaymentDate
} = require('./paymentUtils');

const PAYMENT_ORDER_LOCK_MINUTES = 5;
const MAX_PENDING_PAYMENT_ORDERS_PER_USER = 5;
const ORDER_CREATE_LOCK_TIMEOUT_SECONDS = 5;
const ALIPAY_NOTIFY_PROVIDER = 'alipay';

const createNotifyError = (message, statusCode = 400, options = {}) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.nonRetryable = options.nonRetryable !== false;
  return error;
};

const normalizeClientIp = (value = '') => String(value || '').replace(/^::ffff:/, '').trim();

const isNotifyIpAllowed = (clientIp = '', whitelist = []) => {
  if (!Array.isArray(whitelist) || whitelist.length === 0) return true;
  const normalizedClientIp = normalizeClientIp(clientIp);
  return whitelist.map(normalizeClientIp).includes(normalizedClientIp);
};

const isDateInsideNotifyWindow = (date, minutes) => {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return false;
  const windowMs = Number(minutes || 0) * 60 * 1000;
  const skewMs = 5 * 60 * 1000;
  const diff = Date.now() - date.getTime();
  return diff >= -skewMs && diff <= windowMs;
};

const resolveAlipayBuyerId = async (params = {}) => {
  const notifyBuyerId = normalizeAlipayBuyerId(params);
  if (notifyBuyerId) return notifyBuyerId;

  const queryResponse = await requestAlipayTradeQuery({
    config: paymentConfig.alipay,
    outTradeNo: params.out_trade_no,
    tradeNo: params.trade_no
  });
  return normalizeAlipayBuyerId(queryResponse);
};

const acquireOrderCreateLock = async (connection, userId) => {
  const lockName = `payment_order_create:${Number(userId || 0)}`;
  const [rows] = await connection.execute(
    'SELECT GET_LOCK(?, ?) AS acquired',
    [lockName, ORDER_CREATE_LOCK_TIMEOUT_SECONDS]
  );
  if (Number(rows[0]?.acquired || 0) !== 1) {
    const error = new Error('正在创建订单，请稍后再试');
    error.statusCode = 429;
    throw error;
  }
  return lockName;
};

const releaseOrderCreateLock = async (connection, lockName) => {
  if (!lockName) return;
  try {
    await connection.execute('SELECT RELEASE_LOCK(?)', [lockName]);
  } catch (error) {
    console.error('释放支付订单创建锁失败:', error.message);
  }
};

const ensureAlipayCreateConfig = () => {
  const missing = [];
  if (!paymentConfig.alipay.appId) missing.push('ALIPAY_APP_ID');
  if (!paymentConfig.alipay.privateKey) missing.push('ALIPAY_PRIVATE_KEY');
  if (!paymentConfig.alipay.alipayPublicKey) missing.push('ALIPAY_PUBLIC_KEY');
  if (!paymentConfig.alipay.gatewayUrl) missing.push('ALIPAY_GATEWAY_URL');
  if (!paymentConfig.alipay.notifyUrl) missing.push('ALIPAY_NOTIFY_URL');
  if (process.env.NODE_ENV === 'production' && !paymentConfig.alipay.sellerId) {
    missing.push('ALIPAY_SELLER_ID');
  }
  if (missing.length > 0) {
    const error = new Error(`支付宝支付未配置：${missing.join(', ')}`);
    error.statusCode = 500;
    throw error;
  }
  if (process.env.NODE_ENV === 'production') {
    let notifyUrl;
    try {
      notifyUrl = new URL(paymentConfig.alipay.notifyUrl);
    } catch {
      const error = new Error('支付宝支付未配置：ALIPAY_NOTIFY_URL 必须是公网 HTTPS 地址');
      error.statusCode = 500;
      throw error;
    }
    const hostname = notifyUrl.hostname.toLowerCase();
    if (
      notifyUrl.protocol !== 'https:'
      || hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
    ) {
      const error = new Error('支付宝支付未配置：ALIPAY_NOTIFY_URL 必须是公网 HTTPS 地址');
      error.statusCode = 500;
      throw error;
    }
  }
};

const createAlipayOrder = async ({ userId, productType = 'subscription', productId, planId, durationId, rechargePackageId } = {}) => {
  const normalizedProductType = productType === 'recharge' ? 'recharge' : 'subscription';
  const requestedProductId = productId || (normalizedProductType === 'recharge' ? rechargePackageId || planId : planId);
  ensureAlipayCreateConfig();

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const lockConnection = await pool.getConnection();
  let orderCreateLockName = '';
  let orderNo = '';
  let promotionClaims = [];

  try {
    orderCreateLockName = await acquireOrderCreateLock(lockConnection, userId);
    const now = new Date();
    const mysqlNow = toMysqlDateTime(now);
    await repository.closeExpiredPaymentOrders(pool, mysqlNow);
    await repository.deletePaymentBonusClaimsForClosedOrders(pool);
    const pendingOrderCount = await repository.countPendingPaymentOrdersForUser(pool, {
      userId,
      now: mysqlNow
    });
    if (pendingOrderCount >= MAX_PENDING_PAYMENT_ORDERS_PER_USER) {
      const error = new Error('未支付订单过多，请先完成或等待订单过期后再创建新订单');
      error.statusCode = 429;
      throw error;
    }
    orderNo = createOrderNo();
    let productSnapshot = await buildOrderProductSnapshot({
      productId: requestedProductId,
      durationId,
      userId
    }, pool);
    const activePromotion = productSnapshot.product.activePromotion;
    if (activePromotion?.limitOnce) {
      const claimResult = await acquireUserClaim(pool, {
        purpose: buildPromotionClaimPurpose(activePromotion),
        userId,
        orderNo
      });
      if (claimResult.claimed) {
        promotionClaims = claimResult.claims || [];
      } else {
        productSnapshot = await buildOrderProductSnapshot({
          productId: requestedProductId,
          durationId,
          userId,
          ignorePromotion: true
        }, pool);
      }
    }

    const { product, duration } = productSnapshot;
    const expiresAt = addMinutes(now, PAYMENT_ORDER_LOCK_MINUTES);
    const order = {
      orderNo,
      userId,
      productType: product.productType,
      planId: product.skuId,
      durationId: product.productType === 'recharge' ? 'one_time' : duration.id,
      quotaUsd: productSnapshot.quotaUsd,
      amount: product.price,
      subject: product.subject,
      body: product.productType === 'recharge'
        ? `一次性充值 ${productSnapshot.quotaUsd} 美元额度`
        : `${duration.label}，赠送 ${productSnapshot.quotaUsd} 美元普通余额`,
      expiresAt: toMysqlDateTime(expiresAt),
      expiresInMinutes: PAYMENT_ORDER_LOCK_MINUTES,
      productSnapshotJson: productSnapshot.productSnapshotJson,
      promotionSnapshotJson: productSnapshot.promotionSnapshotJson
    };

    await repository.createPaymentOrder(pool, order);
    const alipayForm = buildAlipayPagePayPayload({
      config: paymentConfig.alipay,
      order
    });

    return {
      orderNo: order.orderNo,
      productType: product.productType,
      amount: product.price,
      expiresAt: expiresAt.toISOString(),
      expiresInMinutes: PAYMENT_ORDER_LOCK_MINUTES,
      alipayForm
    };
  } catch (error) {
    await releaseClaims(pool, {
      orderNo,
      claims: promotionClaims
    });
    throw error;
  } finally {
    await releaseOrderCreateLock(lockConnection, orderCreateLockName);
    lockConnection.release();
  }
};

const handleAlipayNotify = async (params = {}, options = {}) => {
  if (!isNotifyIpAllowed(options.clientIp, paymentConfig.alipay.notifyIpWhitelist)) {
    throw createNotifyError('支付宝通知来源 IP 不在白名单内');
  }

  if (!verifyAlipayNotifyParams(params, paymentConfig.alipay)) {
    throw createNotifyError('支付宝通知验签失败');
  }

  if (params.app_id !== paymentConfig.alipay.appId) {
    throw createNotifyError('支付宝 APP_ID 不匹配');
  }

  if (paymentConfig.alipay.sellerId && params.seller_id !== paymentConfig.alipay.sellerId) {
    throw createNotifyError('支付宝 SELLER_ID 不匹配');
  }

  if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status)) {
    return { status: 'ignored' };
  }

  const notifyId = String(params.notify_id || '').trim();
  if (!notifyId) {
    throw createNotifyError('支付宝通知缺少 notify_id');
  }

  const notifyTime = parseAlipayPaymentDate(params.notify_time);
  const paidAt = parseAlipayPaymentDate(params.gmt_payment || params.notify_time);
  if (!notifyTime || !paidAt) {
    throw createNotifyError('支付宝通知时间格式无效');
  }
  if (!isDateInsideNotifyWindow(paidAt, paymentConfig.alipay.notifyTimeWindowMinutes)) {
    throw createNotifyError('支付宝通知已超过允许处理时间窗');
  }
  const alipayBuyerId = await resolveAlipayBuyerId(params);

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const [insertResult] = await repository.createPaymentNotification(pool, {
    provider: ALIPAY_NOTIFY_PROVIDER,
    notifyId,
    orderNo: params.out_trade_no,
    tradeNo: params.trade_no,
    notifiedAt: toMysqlDateTime(notifyTime)
  });
  if (Number(insertResult?.affectedRows || 0) !== 1) {
    return { status: 'duplicate' };
  }

  try {
    const result = await handlePaidOrder(pool, {
      orderNo: params.out_trade_no,
      alipayTradeNo: params.trade_no,
      alipayBuyerId,
      totalAmount: params.total_amount,
      paidAt
    });
    await repository.updatePaymentNotificationStatus(pool, {
      provider: ALIPAY_NOTIFY_PROVIDER,
      notifyId,
      status: 'processed'
    });
    return result;
  } catch (error) {
    if (error.nonRetryable || (error.statusCode && error.statusCode < 500)) {
      await repository.updatePaymentNotificationStatus(pool, {
        provider: ALIPAY_NOTIFY_PROVIDER,
        notifyId,
        status: 'failed',
        errorMessage: String(error.message || '').slice(0, 255)
      });
      return {
        status: 'failed',
        nonRetryable: true,
        message: error.message
      };
    }
    await repository.deletePaymentNotification(pool, {
      provider: ALIPAY_NOTIFY_PROVIDER,
      notifyId
    });
    throw error;
  }
};

module.exports = {
  createAlipayOrder,
  handleAlipayNotify,
  parseAlipayPaymentDate
};
