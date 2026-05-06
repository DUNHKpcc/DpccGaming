const { getPool } = require('../../config/database');
const paymentConfig = require('../../config/payment');
const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  calculateOrderAmount,
  listPaymentPlans,
  listPaymentDurations,
  listRechargePackages
} = require('./plans');
const {
  buildAlipayPagePayForm,
  verifyAlipayNotifyParams
} = require('./alipay');

const PAYMENT_ORDER_LOCK_MINUTES = 5;
const PAYMENT_SUPPORT_WECHAT = '15160701051';
const PAYMENT_SUPPORT_NOTE = '售后和技术支持添加微信 15160701051';
const PAYMENT_REDEEM_URL = 'https://api.dpccgaming.xyz/console/topup';
const PAYMENT_API_USERNAME_WAIT_NOTE = '已收到 DPCC-API 平台用户名，请等待 5 分钟。';

const toMysqlDateTime = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds())
  ].join('');
};

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + Number(months || 0));
  return next;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + (Number(minutes || 0) * 60 * 1000));

const createOrderNo = () => {
  const datePart = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const randomPart = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DPCC${datePart}${randomPart}`;
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

const getCatalog = () => ({
  plans: listPaymentPlans(),
  durations: listPaymentDurations(),
  rechargePackages: listRechargePackages()
});

const getRedeemCodeCatalog = () => ({
  products: [
    ...listRechargePackages().map((pack) => ({
      productType: 'recharge',
      skuId: pack.id,
      label: pack.name
    }))
  ]
});

const normalizeRedeemProduct = (productType = '', skuId = '') => {
  const normalizedProductType = productType === 'recharge' ? 'recharge' : '';
  const normalizedSkuId = String(skuId || '').trim();
  const product = normalizedProductType === 'recharge' ? getRechargePackage(normalizedSkuId) : null;
  if (!product) {
    const error = new Error('兑换码档位无效');
    error.statusCode = 400;
    throw error;
  }
  return { productType: normalizedProductType, skuId: normalizedSkuId, product };
};

const normalizeRedeemCodes = (codes = []) => {
  const source = Array.isArray(codes) ? codes : String(codes || '').split(/\r?\n/);
  return [...new Set(source
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
};

const assignPaymentFulfillment = async (connection, order = {}, productType = 'subscription', assignedAt = new Date()) => {
  const skuId = productType === 'recharge' ? order.plan_id : order.plan_id;
  const assignedCode = await repository.assignRedeemCodeToOrder(connection, {
    productType,
    skuId,
    orderNo: order.order_no,
    userId: order.user_id,
    assignedAt: toMysqlDateTime(assignedAt)
  });
  const redeemCode = assignedCode?.code || null;
  const fulfillmentStatus = redeemCode ? 'code_assigned' : 'manual_required';

  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus,
    redeemCode,
    redeemUrl: PAYMENT_REDEEM_URL,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_SUPPORT_NOTE
  });

  return {
    fulfillmentStatus,
    redeemCode,
    redeemUrl: PAYMENT_REDEEM_URL,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_SUPPORT_NOTE
  };
};

const setSubscriptionUsernameRequired = async (connection, order = {}) => {
  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus: 'username_required',
    redeemCode: null,
    redeemUrl: null,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_API_USERNAME_WAIT_NOTE
  });

  return {
    fulfillmentStatus: 'username_required',
    redeemCode: null,
    redeemUrl: '',
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_API_USERNAME_WAIT_NOTE
  };
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
    quotaUsd: normalizedProductType === 'recharge' ? rechargePackage.quotaUsd : null,
    amount,
    subject: normalizedProductType === 'recharge' ? rechargePackage.subject : plan.subject,
    body: normalizedProductType === 'recharge' ? `一次性充值 ${rechargePackage.quotaUsd} 美元额度` : duration.label,
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

const importRedeemCodes = async ({ productType, skuId, codes } = {}) => {
  const normalizedProduct = normalizeRedeemProduct(productType, skuId);
  const normalizedCodes = normalizeRedeemCodes(codes);
  if (normalizedCodes.length === 0) {
    const error = new Error('请输入兑换码');
    error.statusCode = 400;
    throw error;
  }

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  let inserted = 0;
  for (const code of normalizedCodes) {
    const [result] = await repository.createRedeemCode(pool, {
      productType: normalizedProduct.productType,
      skuId: normalizedProduct.skuId,
      code
    });
    inserted += Number(result?.affectedRows || 0);
  }

  return {
    productType: normalizedProduct.productType,
    skuId: normalizedProduct.skuId,
    total: normalizedCodes.length,
    inserted,
    duplicate: normalizedCodes.length - inserted
  };
};

const listRedeemCodes = async (filters = {}) => {
  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const rows = await repository.listRedeemCodes(pool, {
    productType: filters.productType === 'recharge' || filters.productType === 'subscription'
      ? filters.productType
      : '',
    skuId: String(filters.skuId || '').trim(),
    status: ['available', 'assigned'].includes(filters.status) ? filters.status : ''
  });
  const stats = await repository.getRedeemCodeStats(pool);

  return {
    codes: rows.map((row) => ({
      id: row.id,
      productType: row.product_type,
      skuId: row.sku_id,
      code: row.code,
      status: row.status,
      assignedOrderNo: row.assigned_order_no || '',
      assignedUserId: row.assigned_user_id || null,
      assignedAt: row.assigned_at || null,
      createdAt: row.created_at || null
    })),
    stats: stats.map((row) => ({
      productType: row.product_type,
      skuId: row.sku_id,
      status: row.status,
      count: Number(row.count || 0)
    }))
  };
};

const getPaymentOrderResult = async ({ userId, orderNo } = {}) => {
  const normalizedOrderNo = String(orderNo || '').trim();
  if (!normalizedOrderNo) {
    const error = new Error('订单号不能为空');
    error.statusCode = 400;
    throw error;
  }

  const pool = getPool();
  await repository.ensurePaymentTables(pool);
  const order = await repository.getPaymentOrderForUser(pool, {
    orderNo: normalizedOrderNo,
    userId
  });
  if (!order) {
    const error = new Error('支付订单不存在');
    error.statusCode = 404;
    throw error;
  }

  const productType = order.product_type === 'recharge' ? 'recharge' : 'subscription';
  const product = productType === 'recharge'
    ? getRechargePackage(order.plan_id)
    : getPaymentPlan(order.plan_id);

  return {
    orderNo: order.order_no,
    productType,
    skuId: order.plan_id,
    productName: product?.name || order.subject,
    amount: Number(order.amount || 0).toFixed(2),
    currency: order.currency || 'CNY',
    status: order.status,
    fulfillmentStatus: order.fulfillment_status || 'pending',
    apiUsername: order.api_username || '',
    redeemCode: order.status === 'paid' && productType === 'recharge' ? (order.redeem_code || '') : '',
    redeemUrl: order.redeem_url || PAYMENT_REDEEM_URL,
    supportWechat: order.support_wechat || PAYMENT_SUPPORT_WECHAT,
    supportNote: order.support_note || PAYMENT_SUPPORT_NOTE,
    paidAt: order.paid_at || null,
    expiresAt: order.expires_at || null,
    createdAt: order.created_at || null
  };
};

const normalizeApiUsername = (apiUsername = '') => String(apiUsername || '').trim();

const parseAlipayPaymentDate = (value = '') => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return new Date();
  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    Number(match[6])
  );
};

const submitPaymentOrderApiUsername = async ({ userId, orderNo, apiUsername } = {}, pool = getPool()) => {
  const normalizedOrderNo = String(orderNo || '').trim();
  const normalizedApiUsername = normalizeApiUsername(apiUsername);
  if (!normalizedOrderNo) {
    const error = new Error('订单号不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (!normalizedApiUsername) {
    const error = new Error('请输入 DPCC-API 平台用户名');
    error.statusCode = 400;
    throw error;
  }
  if (normalizedApiUsername.length > 96) {
    const error = new Error('DPCC-API 平台用户名不能超过 96 个字符');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  const order = await repository.getPaymentOrderForUser(pool, {
    orderNo: normalizedOrderNo,
    userId
  });
  if (!order) {
    const error = new Error('支付订单不存在');
    error.statusCode = 404;
    throw error;
  }
  if (order.status !== 'paid') {
    const error = new Error('订单支付完成后才能填写 DPCC-API 平台用户名');
    error.statusCode = 400;
    throw error;
  }
  if (order.product_type === 'recharge') {
    const error = new Error('普通额度订单不需要填写 DPCC-API 平台用户名');
    error.statusCode = 400;
    throw error;
  }
  if (order.api_username || order.fulfillment_status === 'username_submitted') {
    const error = new Error('DPCC-API 平台用户名已经提交');
    error.statusCode = 400;
    throw error;
  }

  const [result] = await repository.updatePaymentOrderApiUsername(pool, {
    orderNo: normalizedOrderNo,
    userId,
    apiUsername: normalizedApiUsername
  });
  if (!result || result.affectedRows !== 1) {
    const error = new Error('保存 DPCC-API 平台用户名失败');
    error.statusCode = 500;
    throw error;
  }

  return {
    orderNo: normalizedOrderNo,
    apiUsername: normalizedApiUsername,
    fulfillmentStatus: 'username_submitted',
    message: '已提交，请等待 5 分钟'
  };
};

const handlePaidOrder = async (pool, payload = {}) => {
  await repository.ensurePaymentTables(pool);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const order = await repository.getPaymentOrderByNoForUpdate(connection, payload.orderNo);
    if (!order) {
      const error = new Error('支付订单不存在');
      error.statusCode = 404;
      throw error;
    }

    if (Number(order.amount).toFixed(2) !== Number(payload.totalAmount).toFixed(2)) {
      const error = new Error('支付金额不匹配');
      error.statusCode = 400;
      throw error;
    }

    if (order.status === 'paid') {
      await connection.commit();
      return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
    }
    if (order.status !== 'pending') {
      const error = new Error('支付订单不是待支付状态');
      error.statusCode = 400;
      throw error;
    }

    const productType = order.product_type === 'recharge' ? 'recharge' : 'subscription';
    const plan = getPaymentPlan(order.plan_id);
    const duration = getPaymentDuration(order.duration_id);
    const rechargePackage = getRechargePackage(order.plan_id);
    const paidAt = payload.paidAt || new Date();
    const [markResult] = await repository.markOrderPaid(connection, {
      orderNo: payload.orderNo,
      alipayTradeNo: payload.alipayTradeNo,
      paidAt: toMysqlDateTime(paidAt)
    });
    if (!markResult || markResult.affectedRows !== 1) {
      const latestOrder = await repository.getPaymentOrderByNoForUpdate(connection, payload.orderNo);
      if (latestOrder?.status === 'paid') {
        await connection.commit();
        return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
      }
      const error = new Error('支付订单不是待支付状态');
      error.statusCode = 400;
      throw error;
    }

    if (productType === 'recharge') {
      const fulfillment = await assignPaymentFulfillment(connection, order, productType, paidAt);

      if (!rechargePackage) {
        const error = new Error('订单充值配置不存在');
        error.statusCode = 500;
        throw error;
      }

      await repository.addUserBalance(connection, {
        userId: order.user_id,
        quotaUsd: order.quota_usd || rechargePackage.quotaUsd,
        orderNo: payload.orderNo
      });

      await connection.commit();
      return { status: 'paid', orderNo: order.order_no, productType, alreadyPaid: false, ...fulfillment };
    }

    if (!plan || !duration) {
      const error = new Error('订单套餐配置不存在');
      error.statusCode = 500;
      throw error;
    }

    const existingMembership = await repository.getMembershipByUserId(connection, order.user_id);
    const currentExpiry = existingMembership?.expires_at
      ? new Date(existingMembership.expires_at)
      : null;
    const extensionBaseDate = currentExpiry && currentExpiry > paidAt ? currentExpiry : paidAt;
    const startsAt = existingMembership?.starts_at && currentExpiry && currentExpiry > paidAt
      ? new Date(existingMembership.starts_at)
      : paidAt;
    const expiresAt = addMonths(extensionBaseDate, duration.months);
    const membership = {
      userId: order.user_id,
      planId: order.plan_id,
      dailyQuotaUsd: plan.dailyQuotaUsd,
      startsAt: toMysqlDateTime(startsAt),
      expiresAt: toMysqlDateTime(expiresAt),
      orderNo: payload.orderNo
    };

    if (existingMembership) {
      await repository.updateMembership(connection, membership);
    } else {
      await repository.insertMembership(connection, membership);
    }

    const fulfillment = await setSubscriptionUsernameRequired(connection, order);

    await connection.commit();
    return { status: 'paid', orderNo: order.order_no, alreadyPaid: false, ...fulfillment };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
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
    totalAmount: params.total_amount,
    paidAt: parseAlipayPaymentDate(params.gmt_payment || params.notify_time)
  });
};

module.exports = {
  getCatalog,
  getRedeemCodeCatalog,
  importRedeemCodes,
  listRedeemCodes,
  getPaymentOrderResult,
  submitPaymentOrderApiUsername,
  createAlipayOrder,
  handleAlipayNotify,
  handlePaidOrder,
  parseAlipayPaymentDate,
  toMysqlDateTime,
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL
};
