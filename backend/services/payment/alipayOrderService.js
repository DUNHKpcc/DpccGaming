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
const { normalizeProductType } = require('./paymentProductUtils');
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
const ALIPAY_GATEWAY_HOSTS = new Set([
  'openapi.alipay.com',
  'openapi-sandbox.dl.alipaydev.com'
]);

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
  let gatewayUrl;
  try {
    gatewayUrl = new URL(paymentConfig.alipay.gatewayUrl);
  } catch {
    const error = new Error('支付宝支付未配置：ALIPAY_GATEWAY_URL 无效');
    error.statusCode = 500;
    throw error;
  }
  if (gatewayUrl.protocol !== 'https:' || !ALIPAY_GATEWAY_HOSTS.has(gatewayUrl.hostname.toLowerCase())) {
    const error = new Error('支付宝支付未配置：ALIPAY_GATEWAY_URL 必须使用支付宝官方 HTTPS 网关');
    error.statusCode = 500;
    throw error;
  }
  if (process.env.NODE_ENV === 'production') {
    let notifyUrl;
    let returnUrl;
    try {
      notifyUrl = new URL(paymentConfig.alipay.notifyUrl);
      returnUrl = new URL(paymentConfig.alipay.returnUrl);
    } catch {
      const error = new Error('支付宝支付未配置：回调地址必须是公网 HTTPS 地址');
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
    const returnHostname = returnUrl.hostname.toLowerCase();
    if (
      returnUrl.protocol !== 'https:'
      || returnHostname === 'localhost'
      || returnHostname === '127.0.0.1'
      || returnHostname === '::1'
    ) {
      const error = new Error('支付宝支付未配置：ALIPAY_RETURN_URL 必须是公网 HTTPS 地址');
      error.statusCode = 500;
      throw error;
    }
  }
};

const createAlipayOrder = async ({ userId, productType, productId, planId, durationId, rechargePackageId, accountProductId } = {}) => {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) {
    const error = new Error('登录用户无效');
    error.statusCode = 401;
    throw error;
  }
  const normalizedProductType = normalizeProductType(productType);
  if (!normalizedProductType) {
    const error = new Error('支付款项类型无效');
    error.statusCode = 400;
    throw error;
  }
  const requestedProductId = productId
    || (normalizedProductType === 'recharge' ? rechargePackageId : null)
    || (normalizedProductType === 'account' ? accountProductId : null)
    || planId;
  ensureAlipayCreateConfig();

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const lockConnection = await pool.getConnection();
  let orderCreateLockName = '';
  let orderNo = '';
  let promotionClaims = [];

  try {
    orderCreateLockName = await acquireOrderCreateLock(lockConnection, normalizedUserId);
    const now = new Date();
    const mysqlNow = toMysqlDateTime(now);
    await repository.closeExpiredPaymentOrders(pool, mysqlNow);
    await repository.deletePaymentBonusClaimsForClosedOrders(pool);
    const pendingOrderCount = await repository.countPendingPaymentOrdersForUser(pool, {
      userId: normalizedUserId,
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
      productType: normalizedProductType,
      durationId,
      userId: normalizedUserId
    }, pool);
    const activePromotion = productSnapshot.product.activePromotion;
    if (activePromotion?.limitOnce) {
      const claimResult = await acquireUserClaim(pool, {
        purpose: buildPromotionClaimPurpose(activePromotion),
        userId: normalizedUserId,
        orderNo
      });
      if (claimResult.claimed) {
        promotionClaims = claimResult.claims || [];
      } else {
        productSnapshot = await buildOrderProductSnapshot({
          productId: requestedProductId,
          productType: normalizedProductType,
          durationId,
          userId: normalizedUserId,
          ignorePromotion: true
        }, pool);
      }
    }

    const { product, duration } = productSnapshot;
    const expiresAt = addMinutes(now, PAYMENT_ORDER_LOCK_MINUTES);
    const order = {
      orderNo,
      userId: normalizedUserId,
      productType: product.productType,
      planId: product.skuId,
      durationId: product.productType === 'subscription' ? duration.id : 'one_time',
      quotaUsd: productSnapshot.quotaUsd,
      amount: product.price,
      subject: product.subject,
      body: product.productType === 'recharge'
        ? `一次性充值 ${productSnapshot.quotaUsd} 美元额度`
        : product.productType === 'account'
          ? '账号与代充服务，支付后提交目标账号并由售后人工交付'
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

  const orderNo = String(params.out_trade_no || '').trim();
  const tradeNo = String(params.trade_no || '').trim();
  const totalAmount = String(params.total_amount || '').trim();
  if (!/^DPCC\d{14}(?:[A-Z0-9]{6}|[A-F0-9]{16})$/.test(orderNo)) {
    throw createNotifyError('支付宝通知订单号格式无效');
  }
  if (!/^[A-Za-z0-9]{8,96}$/.test(tradeNo)) {
    throw createNotifyError('支付宝通知交易号格式无效');
  }
  if (!/^\d{1,8}(?:\.\d{1,2})?$/.test(totalAmount) || Number(totalAmount) <= 0) {
    throw createNotifyError('支付宝通知金额格式无效');
  }

  const notifyId = String(params.notify_id || '').trim();
  if (!notifyId || notifyId.length > 128 || /[\u0000-\u001f\u007f]/.test(notifyId)) {
    throw createNotifyError('支付宝通知 notify_id 无效');
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
  if (alipayBuyerId.length > 128 || /[\u0000-\u001f\u007f]/.test(alipayBuyerId)) {
    throw createNotifyError('支付宝付款账号标识无效');
  }

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const [insertResult] = await repository.createPaymentNotification(pool, {
    provider: ALIPAY_NOTIFY_PROVIDER,
    notifyId,
    orderNo,
    tradeNo,
    notifiedAt: toMysqlDateTime(notifyTime)
  });
  if (Number(insertResult?.affectedRows || 0) !== 1) {
    return { status: 'duplicate' };
  }

  try {
    const result = await handlePaidOrder(pool, {
      orderNo,
      alipayTradeNo: tradeNo,
      alipayBuyerId,
      totalAmount,
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
