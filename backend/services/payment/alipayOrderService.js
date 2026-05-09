const { getPool } = require('../../config/database');
const paymentConfig = require('../../config/payment');
const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  getRechargeBonusPackage,
  calculateOrderAmount
} = require('./plans');
const {
  buildAlipayPagePayForm,
  verifyAlipayNotifyParams
} = require('./alipay');
const { handlePaidOrder, hasUserRedeemedSku } = require('./paymentFulfillmentService');
const {
  createOrderNo,
  addMinutes,
  toMysqlDateTime,
  parseAlipayPaymentDate
} = require('./paymentUtils');

const PAYMENT_ORDER_LOCK_MINUTES = 5;

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

const createAlipayOrder = async ({ userId, productType = 'subscription', planId, durationId, rechargePackageId } = {}) => {
  const normalizedProductType = productType === 'recharge' ? 'recharge' : 'subscription';
  const plan = getPaymentPlan(planId);
  const duration = getPaymentDuration(durationId);
  const rechargePackage = getRechargePackage(rechargePackageId || planId);
  if (normalizedProductType === 'subscription' && (!plan || !duration)) {
    const error = new Error('支付款项无效');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedProductType === 'recharge' && !rechargePackage) {
    const error = new Error('充值额度无效');
    error.statusCode = 400;
    throw error;
  }
  ensureAlipayCreateConfig();

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const rechargeBonusAlreadyUsed = normalizedProductType === 'recharge'
    ? await hasUserRedeemedSku(pool, {
      userId,
      productType: 'recharge',
      skuId: getRechargeBonusPackage().id
    })
    : false;
  const rechargeQuotaUsd = normalizedProductType === 'recharge' && rechargeBonusAlreadyUsed
    ? rechargePackage.originalQuotaUsd || rechargePackage.quotaUsd
    : rechargePackage?.quotaUsd;

  const now = new Date();
  const expiresAt = addMinutes(now, PAYMENT_ORDER_LOCK_MINUTES);
  const amount = normalizedProductType === 'recharge'
    ? rechargePackage.price
    : calculateOrderAmount(plan, duration);
  const order = {
    orderNo: createOrderNo(),
    userId,
    productType: normalizedProductType,
    planId: normalizedProductType === 'recharge' ? rechargePackage.id : plan.id,
    durationId: normalizedProductType === 'recharge' ? 'one_time' : duration.id,
    quotaUsd: normalizedProductType === 'recharge' ? rechargeQuotaUsd : plan.bonusQuotaUsd,
    amount,
    subject: normalizedProductType === 'recharge' ? rechargePackage.subject : plan.subject,
    body: normalizedProductType === 'recharge' ? `一次性充值 ${rechargeQuotaUsd} 美元额度` : `${duration.label}，赠送 ${plan.bonusQuotaUsd} 美元普通余额`,
    expiresAt: toMysqlDateTime(expiresAt),
    expiresInMinutes: PAYMENT_ORDER_LOCK_MINUTES
  };

  await repository.createPaymentOrder(pool, order);

  const formHtml = buildAlipayPagePayForm({
    config: paymentConfig.alipay,
    order
  });

  return {
    orderNo: order.orderNo,
    productType: normalizedProductType,
    amount,
    expiresAt: expiresAt.toISOString(),
    expiresInMinutes: PAYMENT_ORDER_LOCK_MINUTES,
    formHtml
  };
};

const handleAlipayNotify = async (params = {}) => {
  if (!verifyAlipayNotifyParams(params, paymentConfig.alipay)) {
    const error = new Error('支付宝通知验签失败');
    error.statusCode = 400;
    throw error;
  }

  if (params.app_id !== paymentConfig.alipay.appId) {
    const error = new Error('支付宝 APP_ID 不匹配');
    error.statusCode = 400;
    throw error;
  }

  if (paymentConfig.alipay.sellerId && params.seller_id !== paymentConfig.alipay.sellerId) {
    const error = new Error('支付宝 SELLER_ID 不匹配');
    error.statusCode = 400;
    throw error;
  }

  if (!['TRADE_SUCCESS', 'TRADE_FINISHED'].includes(params.trade_status)) {
    return { status: 'ignored' };
  }

  return handlePaidOrder(getPool(), {
    orderNo: params.out_trade_no,
    alipayTradeNo: params.trade_no,
    alipayBuyerId: params.buyer_id,
    totalAmount: params.total_amount,
    paidAt: parseAlipayPaymentDate(params.gmt_payment || params.notify_time)
  });
};

module.exports = {
  createAlipayOrder,
  handleAlipayNotify,
  parseAlipayPaymentDate
};
