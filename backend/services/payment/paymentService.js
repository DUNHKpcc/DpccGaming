const { getPool } = require('../../config/database');
const paymentConfig = require('../../config/payment');
const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  getRechargeBonusPackage,
  calculateOrderAmount,
  listPaymentPlans,
  listPaymentDurations,
  listRechargePackages
} = require('./plans');
const {
  buildAlipayPagePayForm,
  verifyAlipayNotifyParams
} = require('./alipay');
const {
  encryptRedeemCode,
  decryptRedeemCode
} = require('./redeemCodeCrypto');

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

const buildRedeemCodeInventory = (stats = []) => {
  const availableBySku = new Map();
  stats.forEach((row = {}) => {
    if (row.status !== 'available') return;
    const key = `${row.product_type}:${row.sku_id}`;
    availableBySku.set(key, Number(row.count || 0));
  });
  const availableFor = (productType, skuId) => availableBySku.get(`${productType}:${skuId}`) || 0;
  const bonusPackage = getRechargeBonusPackage();
  const bonusAvailable = availableFor('recharge', bonusPackage.id);

  return {
    availableFor,
    bonusPackage,
    bonusAvailable
  };
};

const getCatalog = async (pool = getPool()) => {
  await repository.ensurePaymentTables(pool);
  const inventory = buildRedeemCodeInventory(await repository.getRedeemCodeStats(pool));

  return {
    plans: listPaymentPlans().map((plan) => ({
      ...plan,
      bonusRedeemCodesAvailable: inventory.bonusAvailable
    })),
    durations: listPaymentDurations(),
    rechargePackages: listRechargePackages().map((pack) => ({
      ...pack,
      availableRedeemCodes: inventory.availableFor('recharge', pack.id),
      bonusRedeemCodesAvailable: inventory.bonusAvailable
    })),
    bonusRedeemCodeStock: {
      skuId: inventory.bonusPackage.id,
      available: inventory.bonusAvailable
    }
  };
};

const getRedeemCodeCatalog = () => ({
  products: [
    ...listRechargePackages().map((pack) => ({
      productType: 'recharge',
      skuId: pack.id,
      label: pack.name
    })),
    {
      productType: 'recharge',
      skuId: getRechargeBonusPackage().id,
      label: getRechargeBonusPackage().name
    }
  ]
});

const normalizeRedeemProduct = (productType = '', skuId = '') => {
  const normalizedProductType = productType === 'recharge' ? 'recharge' : '';
  const normalizedSkuId = String(skuId || '').trim();
  const bonusPackage = getRechargeBonusPackage();
  const product = normalizedProductType === 'recharge'
    ? getRechargePackage(normalizedSkuId) || (normalizedSkuId === bonusPackage.id ? bonusPackage : null)
    : null;
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

const normalizeRedeemCodeIds = (ids = []) => {
  const source = Array.isArray(ids) ? ids : [ids];
  return [...new Set(source
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];
};

const maskRedeemCode = (code = '') => {
  const normalized = String(code || '').trim();
  if (!normalized) return '';
  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  }
  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
};

const buildRedeemCodes = (order = {}, options = {}) => {
  const formatCode = options.masked ? maskRedeemCode : (code) => code;
  return [
    { label: '原有额度', code: order.redeem_code },
    { label: '赠送 $30', code: order.bonus_redeem_code }
  ]
    .filter((item) => item.code)
    .map((item) => ({
      ...item,
      code: formatCode(item.code)
    }));
};

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

const getRedeemCodeByLabel = (redeemCodes = [], labelMatcher) => (
  redeemCodes.find((item) => labelMatcher(String(item.label || '')))?.code || ''
);

const assignBonusRedeemCode = async (connection, order = {}, assignedAt = new Date()) => {
  const assignedCode = await repository.assignRedeemCodeToOrder(connection, {
    productType: 'recharge',
    skuId: getRechargeBonusPackage().id,
    orderNo: order.order_no,
    userId: order.user_id,
    assignedAt: toMysqlDateTime(assignedAt)
  });

  return {
    assignedCode,
    redeemCode: assignedCode ? decryptRedeemCode(assignedCode) : null
  };
};

const assignPaymentFulfillment = async (connection, order = {}, productType = 'subscription', assignedAt = new Date()) => {
  const skuId = productType === 'recharge' ? order.plan_id : order.plan_id;
  const assignedAtText = toMysqlDateTime(assignedAt);
  const assignCode = (targetSkuId) => repository.assignRedeemCodeToOrder(connection, {
    productType,
    skuId: targetSkuId,
    orderNo: order.order_no,
    userId: order.user_id,
    assignedAt: assignedAtText
  });
  const assignedCode = await assignCode(skuId);
  const bonusAssignment = assignedCode ? await assignBonusRedeemCode(connection, order, assignedAt) : {};
  const redeemCode = assignedCode ? decryptRedeemCode(assignedCode) : null;
  const bonusRedeemCode = bonusAssignment.redeemCode || null;
  const fulfillmentStatus = redeemCode && bonusRedeemCode ? 'code_assigned' : 'manual_required';

  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus,
    redeemCodeId: assignedCode?.id || null,
    bonusRedeemCodeId: bonusAssignment.assignedCode?.id || null,
    redeemCode: null,
    bonusRedeemCode: null,
    redeemUrl: PAYMENT_REDEEM_URL,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_SUPPORT_NOTE
  });

  const redeemCodes = buildRedeemCodes({
    redeem_code: redeemCode,
    bonus_redeem_code: bonusRedeemCode
  });

  return {
    fulfillmentStatus,
    redeemCode,
    bonusRedeemCode,
    redeemCodes,
    redeemUrl: PAYMENT_REDEEM_URL,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_SUPPORT_NOTE
  };
};

const setSubscriptionUsernameRequired = async (connection, order = {}, bonusAssignment = {}) => {
  const redeemCodes = buildRedeemCodes({
    bonus_redeem_code: bonusAssignment.redeemCode
  });
  const hasBonusCode = Boolean(bonusAssignment.redeemCode);
  const fulfillmentStatus = hasBonusCode ? 'username_required' : 'manual_required';
  const supportNote = hasBonusCode
    ? PAYMENT_API_USERNAME_WAIT_NOTE
    : '赠送兑换码库存不足，请提交 DPCC-API 平台用户名，并添加售后微信补发赠送码。';

  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus,
    bonusRedeemCodeId: bonusAssignment.assignedCode?.id || null,
    redeemCode: null,
    bonusRedeemCode: null,
    redeemUrl: bonusAssignment.redeemCode ? PAYMENT_REDEEM_URL : null,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote
  });

  return {
    fulfillmentStatus,
    redeemCode: null,
    bonusRedeemCode: bonusAssignment.redeemCode || '',
    redeemCodes,
    redeemUrl: bonusAssignment.redeemCode ? PAYMENT_REDEEM_URL : '',
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote
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
    quotaUsd: normalizedProductType === 'recharge' ? rechargePackage.quotaUsd : plan.bonusQuotaUsd,
    amount,
    subject: normalizedProductType === 'recharge' ? rechargePackage.subject : plan.subject,
    body: normalizedProductType === 'recharge' ? `一次性充值 ${rechargePackage.quotaUsd} 美元额度` : `${duration.label}，赠送 ${plan.bonusQuotaUsd} 美元普通余额`,
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

const importRedeemCodes = async ({ productType, skuId, codes } = {}, pool = getPool()) => {
  const normalizedProduct = normalizeRedeemProduct(productType, skuId);
  const normalizedCodes = normalizeRedeemCodes(codes);
  if (normalizedCodes.length === 0) {
    const error = new Error('请输入兑换码');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  let inserted = 0;
  for (const code of normalizedCodes) {
    const legacyCode = await repository.getRedeemCodeByPlainCode(pool, code);
    if (legacyCode) continue;

    const encryptedCode = encryptRedeemCode(code);
    const [result] = await repository.createRedeemCode(pool, {
      productType: normalizedProduct.productType,
      skuId: normalizedProduct.skuId,
      code: encryptedCode.codeStorageValue,
      codeCiphertext: encryptedCode.codeCiphertext,
      codeIv: encryptedCode.codeIv,
      codeAuthTag: encryptedCode.codeAuthTag,
      codeLookupHash: encryptedCode.codeLookupHash
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

const listRedeemCodes = async (filters = {}, pool = getPool()) => {
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
      maskedCode: maskRedeemCode(decryptRedeemCode(row)),
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

const getRedeemCodeSecret = async ({ id } = {}, pool = getPool()) => {
  const normalizedIds = normalizeRedeemCodeIds([id]);
  if (normalizedIds.length !== 1) {
    const error = new Error('兑换码 ID 无效');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  const row = await repository.getRedeemCodeById(pool, normalizedIds[0]);
  if (!row) {
    const error = new Error('兑换码不存在');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: row.id,
    productType: row.product_type,
    skuId: row.sku_id,
    status: row.status,
    code: decryptRedeemCode(row)
  };
};

const deleteRedeemCodes = async ({ ids } = {}, pool = getPool()) => {
  const normalizedIds = normalizeRedeemCodeIds(ids);
  if (normalizedIds.length === 0) {
    const error = new Error('请选择要删除的兑换码');
    error.statusCode = 400;
    throw error;
  }

  await repository.ensurePaymentTables(pool);
  const [result] = await repository.deleteAvailableRedeemCodes(pool, normalizedIds);
  const deleted = Number(result?.affectedRows || 0);

  return {
    requested: normalizedIds.length,
    deleted,
    skipped: normalizedIds.length - deleted
  };
};

const deleteRedeemCode = async ({ id } = {}, pool = getPool()) => {
  const result = await deleteRedeemCodes({ ids: [id] }, pool);
  if (result.deleted !== 1) {
    const error = new Error('兑换码不存在或已分配，不能删除');
    error.statusCode = 400;
    throw error;
  }
  return result;
};

const getPaymentOrderResult = async ({ userId, orderNo } = {}, pool = getPool()) => {
  const normalizedOrderNo = String(orderNo || '').trim();
  if (!normalizedOrderNo) {
    const error = new Error('订单号不能为空');
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
    fulfillmentStatus: order.fulfillment_status === 'manual_required' ? 'manual_required' : 'username_submitted',
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

    const bonusQuotaUsd = Number(order.quota_usd || plan.bonusQuotaUsd || 0);
    if (bonusQuotaUsd > 0) {
      await repository.addUserBalance(connection, {
        userId: order.user_id,
        quotaUsd: bonusQuotaUsd.toFixed(2),
        orderNo: payload.orderNo
      });
    }

    const bonusAssignment = await assignBonusRedeemCode(connection, order, paidAt);
    const fulfillment = await setSubscriptionUsernameRequired(connection, order, bonusAssignment);

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
  getRedeemCodeSecret,
  deleteRedeemCode,
  deleteRedeemCodes,
  getPaymentOrderResult,
  listAdminPaymentOrders,
  getAdminPaymentOrderDetail,
  deleteAdminPaymentOrder,
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
