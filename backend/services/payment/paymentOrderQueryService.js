const { getPool } = require('../../config/database');
const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getRechargePackage
} = require('./plans');
const { decryptRedeemCode } = require('./redeemCodeCrypto');
const {
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL,
  toMysqlDateTime,
  buildRedeemCodes,
  getRedeemCodeByLabel,
  normalizeRedeemCodeIds,
  normalizeApiUsername
} = require('./paymentUtils');

const closeExpiredPaymentOrder = (executor, orderNo = '', now = new Date()) => repository.closeExpiredPaymentOrder(executor, {
  orderNo,
  now: toMysqlDateTime(now)
});

const getRedeemCodeRowsById = async (executor, orders = []) => {
  const ids = normalizeRedeemCodeIds(orders.flatMap((order) => [
    order.redeem_code_id,
    order.bonus_redeem_code_id
  ]));
  if (!ids.length) return new Map();
  const rows = await repository.getRedeemCodesByIds(executor, ids);
  return new Map(rows.map((row) => [Number(row.id), row]));
};

const buildOrderRedeemCodes = (order = {}, rowsById = new Map(), options = {}) => {
  const hasAssignedIds = Boolean(order.redeem_code_id || order.bonus_redeem_code_id);
  if (!hasAssignedIds) return buildRedeemCodes(order, options);

  const redeemCodeRow = rowsById.get(Number(order.redeem_code_id));
  const bonusRedeemCodeRow = rowsById.get(Number(order.bonus_redeem_code_id));
  const assignedCodes = buildRedeemCodes({
    redeem_code: redeemCodeRow ? decryptRedeemCode(redeemCodeRow) : '',
    bonus_redeem_code: bonusRedeemCodeRow ? decryptRedeemCode(bonusRedeemCodeRow) : ''
  }, options);
  return assignedCodes.length > 0 ? assignedCodes : buildRedeemCodes(order, options);
};

const getPaymentOrderResult = async ({ userId, orderNo } = {}, pool = getPool()) => {
  const normalizedOrderNo = String(orderNo || '').trim();
  if (!normalizedOrderNo) {
    const error = new Error('订单号不能为空');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  await closeExpiredPaymentOrder(pool, normalizedOrderNo);
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
  const redeemCodes = order.status === 'paid' && (productType === 'recharge' || productType === 'subscription')
    ? buildOrderRedeemCodes(order, await getRedeemCodeRowsById(pool, [order]))
    : [];

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
    redeemCode: getRedeemCodeByLabel(redeemCodes, (label) => label === '原有额度'),
    bonusRedeemCode: getRedeemCodeByLabel(redeemCodes, (label) => label.includes('赠送')),
    redeemCodes,
    redeemUrl: order.redeem_url || PAYMENT_REDEEM_URL,
    supportWechat: order.support_wechat || PAYMENT_SUPPORT_WECHAT,
    supportNote: order.support_note || PAYMENT_SUPPORT_NOTE,
    paidAt: order.paid_at || null,
    expiresAt: order.expires_at || null,
    createdAt: order.created_at || null
  };
};

const resolvePaymentProductName = (order = {}) => {
  const productType = order.product_type === 'recharge' ? 'recharge' : 'subscription';
  const product = productType === 'recharge'
    ? getRechargePackage(order.plan_id)
    : getPaymentPlan(order.plan_id);
  return {
    productType,
    productName: product?.name || order.subject || order.plan_id
  };
};

const mapAdminPaymentOrder = (order = {}, rowsById = new Map()) => {
  const product = resolvePaymentProductName(order);
  const maskedRedeemCodes = buildOrderRedeemCodes(order, rowsById, { masked: true });
  return {
    orderNo: order.order_no,
    userId: order.user_id,
    username: order.username || '',
    email: order.email || '',
    provider: order.provider || 'alipay',
    productType: product.productType,
    skuId: order.plan_id,
    durationId: order.duration_id,
    quotaUsd: order.quota_usd || null,
    productName: product.productName,
    subject: order.subject || '',
    amount: Number(order.amount || 0).toFixed(2),
    currency: order.currency || 'CNY',
    status: order.status,
    fulfillmentStatus: order.fulfillment_status || 'pending',
    apiUsername: order.api_username || '',
    maskedRedeemCode: getRedeemCodeByLabel(maskedRedeemCodes, (label) => label === '原有额度'),
    maskedBonusRedeemCode: getRedeemCodeByLabel(maskedRedeemCodes, (label) => label.includes('赠送')),
    maskedRedeemCodes,
    alipayTradeNo: order.alipay_trade_no || '',
    paidAt: order.paid_at || null,
    expiresAt: order.expires_at || null,
    createdAt: order.created_at || null,
    updatedAt: order.updated_at || null
  };
};

const listAdminPaymentOrders = async (filters = {}, pool = getPool()) => {
  await repository.ensurePaymentTables(pool);
  await repository.closeExpiredPaymentOrders(pool, toMysqlDateTime(new Date()));
  const rows = await repository.listPaymentOrders(pool, {
    orderNo: String(filters.orderNo || '').trim(),
    status: ['pending', 'paid', 'closed'].includes(filters.status) ? filters.status : ''
  });
  const rowsById = await getRedeemCodeRowsById(pool, rows);

  return {
    orders: rows.map((row) => mapAdminPaymentOrder(row, rowsById))
  };
};

const getAdminPaymentOrderDetail = async ({ orderNo } = {}, pool = getPool()) => {
  const normalizedOrderNo = String(orderNo || '').trim();
  if (!normalizedOrderNo) {
    const error = new Error('订单号不能为空');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  await closeExpiredPaymentOrder(pool, normalizedOrderNo);
  const order = await repository.getPaymentOrderDetailByNo(pool, normalizedOrderNo);
  if (!order) {
    const error = new Error('支付订单不存在');
    error.statusCode = 404;
    throw error;
  }

  const rowsById = await getRedeemCodeRowsById(pool, [order]);
  return mapAdminPaymentOrder(order, rowsById);
};

const deleteAdminPaymentOrder = async ({ orderNo } = {}, pool = getPool()) => {
  const normalizedOrderNo = String(orderNo || '').trim();
  if (!normalizedOrderNo) {
    const error = new Error('订单号不能为空');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  const order = await repository.getPaymentOrderDetailByNo(pool, normalizedOrderNo);
  if (!order) {
    const error = new Error('支付订单不存在');
    error.statusCode = 404;
    throw error;
  }
  if (order.status === 'paid') {
    const error = new Error('已支付订单不能删除');
    error.statusCode = 400;
    throw error;
  }

  const [result] = await repository.deleteUnpaidPaymentOrder(pool, normalizedOrderNo);
  if (!result || result.affectedRows !== 1) {
    const error = new Error('删除订单失败');
    error.statusCode = 500;
    throw error;
  }

  return {
    deleted: 1,
    order: mapAdminPaymentOrder(order)
  };
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
    fulfillmentStatus: order.fulfillment_status === 'manual_required' ? 'manual_required' : 'username_submitted',
    message: '已提交，请等待 5 分钟'
  };
};

module.exports = {
  getPaymentOrderResult,
  listAdminPaymentOrders,
  getAdminPaymentOrderDetail,
  deleteAdminPaymentOrder,
  submitPaymentOrderApiUsername
};
