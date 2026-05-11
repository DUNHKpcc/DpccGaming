const { getPool } = require('../../config/database');
const repository = require('../../repositories/paymentRepository');
const {
  getPaymentDuration,
  getRechargeBonusPackage,
  listDefaultPaymentProducts,
  listPaymentDurations
} = require('./plans');
const {
  fromCents,
  normalizeMoney,
  normalizeProductType,
  normalizeQuota,
  parseJsonArray,
  resolveEffectiveProduct,
  stringifyJsonArray,
  toCents
} = require('./paymentProductUtils');
const { buildScopedClaim } = require('./paymentClaimService');
const { toMysqlDateTime } = require('./paymentUtils');

const toDbProduct = (product = {}) => ({
  productType: normalizeProductType(product.productType),
  skuId: String(product.skuId || '').trim(),
  name: String(product.name || '').trim(),
  subject: String(product.subject || product.name || '').trim(),
  description: String(product.description || '').trim(),
  basePrice: normalizeMoney(product.basePrice),
  currency: String(product.currency || 'CNY').trim(),
  baseQuotaUsd: product.baseQuotaUsd === null || product.baseQuotaUsd === undefined
    ? null
    : normalizeQuota(product.baseQuotaUsd),
  dailyQuotaUsd: product.dailyQuotaUsd === null || product.dailyQuotaUsd === undefined
    ? null
    : normalizeQuota(product.dailyQuotaUsd),
  mainRedeemSkuId: String(product.mainRedeemSkuId || '').trim(),
  bonusRedeemSkuId: String(product.bonusRedeemSkuId || '').trim(),
  bonusQuotaUsd: normalizeQuota(product.bonusQuotaUsd),
  recommended: product.recommended ? 1 : 0,
  cardBadge: String(product.cardBadge || '').trim(),
  cardFeaturesJson: stringifyJsonArray(product.cardFeatures),
  orderNote: String(product.orderNote || '').trim(),
  sortOrder: Number.isInteger(Number(product.sortOrder)) ? Number(product.sortOrder) : 0,
  status: product.status === 'inactive' ? 'inactive' : 'active'
});

const validateProductInput = (product = {}, options = {}) => {
  if (!product.skuId && options.requireSku !== false) {
    const error = new Error('商品 SKU 不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (!product.name) {
    const error = new Error('商品名称不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (!product.subject) {
    const error = new Error('支付宝商品标题不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (Number(product.basePrice) < 0) {
    const error = new Error('商品金额不能小于 0');
    error.statusCode = 400;
    throw error;
  }
  if (product.productType === 'subscription' && Number(product.dailyQuotaUsd || 0) <= 0) {
    const error = new Error('月卡每日额度必须大于 0');
    error.statusCode = 400;
    throw error;
  }
  if (product.productType === 'recharge' && Number(product.baseQuotaUsd || 0) <= 0) {
    const error = new Error('充值到账额度必须大于 0');
    error.statusCode = 400;
    throw error;
  }
};

const seedDefaultPaymentProducts = async (pool = getPool()) => {
  await repository.ensurePaymentTables(pool);
  const existing = await repository.listPaymentProducts(pool, {});
  if (existing.length > 0) return { seeded: 0 };

  let seeded = 0;
  for (const product of listDefaultPaymentProducts()) {
    const [result] = await repository.createPaymentProduct(pool, toDbProduct(product));
    seeded += Number(result?.affectedRows || 0);
  }
  return { seeded };
};

const closeExpiredOrdersAndClaims = async (pool = getPool()) => {
  await repository.closeExpiredPaymentOrders(pool, toMysqlDateTime(new Date()));
  await repository.deletePaymentBonusClaimsForClosedOrders(pool);
};

const buildInventory = (stats = []) => {
  const availableBySku = new Map();
  stats.forEach((row = {}) => {
    if (row.status !== 'available') return;
    availableBySku.set(`${row.product_type}:${row.sku_id}`, Number(row.count || 0));
  });
  return (productType, skuId) => availableBySku.get(`${productType}:${skuId}`) || 0;
};

const buildRedeemedSkuSet = async (pool, userId) => {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return new Set();

  const rows = await repository.listAssignedRedeemCodeSkusForUser(pool, normalizedUserId);
  return new Set(rows.map((row) => `${row.product_type}:${row.sku_id}`));
};

const getPromotionClaim = (promotion = {}, userId) => {
  if (!promotion?.limit_once || !userId) return null;
  const purpose = promotion.claim_scope_key || `promotion_${promotion.id}`;
  return buildScopedClaim(purpose, 'user', userId);
};

const hasPromotionClaim = async (pool, promotion = {}, userId) => {
  const claim = getPromotionClaim(promotion, userId);
  if (!claim) return false;
  return Boolean(await repository.getPaymentBonusClaim(pool, claim));
};

const mapPromotion = (row = {}) => ({
  id: row.id,
  productId: row.product_id,
  title: row.title,
  badgeText: row.badge_text || '',
  startsAt: row.starts_at || null,
  endsAt: row.ends_at || null,
  promotionPrice: row.promotion_price === null ? null : normalizeMoney(row.promotion_price),
  promotionBonusQuotaUsd: normalizeQuota(row.promotion_bonus_quota_usd),
  limitOnce: Boolean(row.limit_once),
  limitScope: row.limit_scope || 'user',
  claimScopeKey: row.claim_scope_key || `promotion_${row.id}`,
  status: row.status,
  createdAt: row.created_at || null,
  updatedAt: row.updated_at || null
});

const mapProductRow = (row = {}, options = {}) => {
  const promotionRow = options.promotion || null;
  const effective = resolveEffectiveProduct(row, promotionRow, options.now || new Date());
  const activePromotion = effective.activePromotion ? mapPromotion(effective.activePromotion) : null;
  const productType = row.product_type === 'recharge' ? 'recharge' : 'subscription';
  const baseQuotaUsd = normalizeQuota(row.base_quota_usd);
  const baseBonusQuotaUsd = normalizeQuota(row.bonus_quota_usd);
  const bonusQuotaUsd = effective.bonusQuotaUsd;
  const quotaUsd = productType === 'recharge'
    ? (Number(baseQuotaUsd) + Number(bonusQuotaUsd)).toFixed(2)
    : baseQuotaUsd;
  const mainRedeemSkuId = row.main_redeem_sku_id || (productType === 'recharge' ? row.sku_id : '');
  const bonusRedeemSkuId = row.bonus_redeem_sku_id || getRechargeBonusPackage().id;
  const availableFor = options.availableFor || (() => 0);
  const redeemedSkuSet = options.redeemedSkuSet || new Set();

  return {
    id: row.id,
    productType,
    skuId: row.sku_id,
    name: row.name,
    subject: row.subject,
    description: row.description || '',
    price: effective.displayPrice,
    displayPrice: effective.displayPrice,
    basePrice: effective.basePrice,
    originalPrice: effective.basePrice,
    currency: row.currency || 'CNY',
    baseQuotaUsd,
    baseBonusQuotaUsd,
    quotaUsd,
    dailyQuotaUsd: row.daily_quota_usd === null ? null : normalizeQuota(row.daily_quota_usd),
    mainRedeemSkuId,
    bonusRedeemSkuId,
    bonusQuotaUsd,
    recommended: Boolean(row.recommended),
    cardBadge: row.card_badge || '',
    features: parseJsonArray(row.card_features_json),
    orderNote: row.order_note || '',
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
    availableRedeemCodes: productType === 'recharge' ? availableFor('recharge', mainRedeemSkuId) : 0,
    bonusRedeemCodesAvailable: bonusRedeemSkuId ? availableFor('recharge', bonusRedeemSkuId) : 0,
    bonusRedeemCodeUsed: bonusRedeemSkuId ? redeemedSkuSet.has(`recharge:${bonusRedeemSkuId}`) : false,
    promotionUsed: Boolean(options.promotionUsed),
    isPurchasable: row.status === 'active',
    activePromotion
  };
};

const getEffectivePromotionForProduct = async (pool, productId, options = {}) => {
  const now = options.now || new Date();
  const rows = await repository.getActivePaymentPromotionsForProduct(pool, {
    productId,
    now: toMysqlDateTime(now)
  });
  for (const row of rows) {
    if (row.limit_once && await hasPromotionClaim(pool, row, options.userId)) continue;
    return row;
  }
  return null;
};

const getCatalog = async (options = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  await closeExpiredOrdersAndClaims(pool);
  const now = new Date();
  const products = await repository.listPaymentProducts(pool, { status: 'active' });
  const stats = await repository.getRedeemCodeStats(pool);
  const availableFor = buildInventory(stats);
  const redeemedSkuSet = await buildRedeemedSkuSet(pool, options.userId);
  const mappedProducts = [];

  for (const product of products) {
    const promotion = await getEffectivePromotionForProduct(pool, product.id, {
      userId: options.userId,
      now
    });
    const promotionUsed = promotion ? false : (await Promise.all(
      (await repository.listPaymentPromotions(pool, { productId: product.id, status: 'active' }))
        .filter((row) => row.limit_once)
        .map((row) => hasPromotionClaim(pool, row, options.userId))
    )).some(Boolean);
    mappedProducts.push(mapProductRow(product, {
      promotion,
      promotionUsed,
      now,
      availableFor,
      redeemedSkuSet
    }));
  }

  const subscriptionProducts = mappedProducts.filter((product) => product.productType === 'subscription');
  const rechargeProducts = mappedProducts.filter((product) => product.productType === 'recharge');
  const bonusPackage = getRechargeBonusPackage();

  return {
    subscriptionProducts,
    rechargeProducts,
    plans: subscriptionProducts,
    rechargePackages: rechargeProducts,
    durations: listPaymentDurations(),
    bonusRedeemCodeStock: {
      skuId: bonusPackage.id,
      available: availableFor('recharge', bonusPackage.id)
    }
  };
};

const listAdminPaymentProducts = async (filters = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const products = await repository.listPaymentProducts(pool, {
    productType: ['subscription', 'recharge'].includes(filters.productType) ? filters.productType : '',
    status: ['active', 'inactive'].includes(filters.status) ? filters.status : '',
    keyword: String(filters.keyword || '').trim()
  });
  const stats = await repository.getRedeemCodeStats(pool);
  const availableFor = buildInventory(stats);
  const rows = [];

  for (const product of products) {
    const promotion = await getEffectivePromotionForProduct(pool, product.id);
    rows.push({
      ...mapProductRow(product, { promotion, availableFor }),
      promotions: (await repository.listPaymentPromotions(pool, { productId: product.id })).map(mapPromotion)
    });
  }

  return { products: rows };
};

const createAdminPaymentProduct = async (payload = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const product = toDbProduct(payload);
  validateProductInput(product);
  const existing = await repository.getPaymentProductBySkuId(pool, product.skuId);
  if (existing) {
    const error = new Error('商品 SKU 已存在');
    error.statusCode = 400;
    throw error;
  }

  const [result] = await repository.createPaymentProduct(pool, product);
  const row = await repository.getPaymentProductById(pool, result.insertId);
  return { product: mapProductRow(row) };
};

const updateAdminPaymentProduct = async (payload = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const id = Number(payload.id || 0);
  const current = await repository.getPaymentProductById(pool, id);
  if (!current) {
    const error = new Error('支付档位不存在');
    error.statusCode = 404;
    throw error;
  }

  const product = toDbProduct({
    ...payload,
    skuId: current.sku_id
  });
  product.id = id;
  validateProductInput(product, { requireSku: false });
  await repository.updatePaymentProduct(pool, product);
  const row = await repository.getPaymentProductById(pool, id);
  return { product: mapProductRow(row) };
};

const copyAdminPaymentProduct = async ({ id } = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const source = await repository.getPaymentProductById(pool, Number(id || 0));
  if (!source) {
    const error = new Error('支付档位不存在');
    error.statusCode = 404;
    throw error;
  }

  const product = toDbProduct({
    productType: source.product_type,
    skuId: `${source.sku_id}-copy-${Date.now().toString(36)}`,
    name: `${source.name} 副本`,
    subject: source.subject,
    description: source.description,
    basePrice: source.base_price,
    currency: source.currency,
    baseQuotaUsd: source.base_quota_usd,
    dailyQuotaUsd: source.daily_quota_usd,
    mainRedeemSkuId: source.main_redeem_sku_id,
    bonusRedeemSkuId: source.bonus_redeem_sku_id,
    bonusQuotaUsd: source.bonus_quota_usd,
    recommended: false,
    cardBadge: source.card_badge,
    cardFeatures: parseJsonArray(source.card_features_json),
    orderNote: source.order_note,
    sortOrder: Number(source.sort_order || 0) + 1,
    status: 'inactive'
  });
  const [result] = await repository.createPaymentProduct(pool, product);
  const row = await repository.getPaymentProductById(pool, result.insertId);
  return { product: mapProductRow(row) };
};

const normalizeOptionalMoney = (value) => (
  value === '' || value === null || value === undefined ? null : normalizeMoney(value)
);

const normalizePromotionPayload = (payload = {}) => ({
  id: Number(payload.id || 0),
  productId: Number(payload.productId || payload.product_id || 0),
  title: String(payload.title || '').trim(),
  badgeText: String(payload.badgeText || payload.badge_text || '').trim(),
  startsAt: payload.startsAt || payload.starts_at || null,
  endsAt: payload.endsAt || payload.ends_at || null,
  promotionPrice: normalizeOptionalMoney(payload.promotionPrice ?? payload.promotion_price),
  promotionBonusQuotaUsd: normalizeQuota(payload.promotionBonusQuotaUsd ?? payload.promotion_bonus_quota_usd),
  limitOnce: Boolean(payload.limitOnce ?? payload.limit_once),
  limitScope: 'user',
  claimScopeKey: '',
  status: payload.status === 'inactive' ? 'inactive' : 'active'
});

const validatePromotionInput = async (pool, promotion = {}) => {
  if (!promotion.productId) {
    const error = new Error('促销所属档位不能为空');
    error.statusCode = 400;
    throw error;
  }
  const product = await repository.getPaymentProductById(pool, promotion.productId);
  if (!product) {
    const error = new Error('促销所属档位不存在');
    error.statusCode = 404;
    throw error;
  }
  if (!promotion.title) {
    const error = new Error('促销名称不能为空');
    error.statusCode = 400;
    throw error;
  }
  if (promotion.startsAt && promotion.endsAt && new Date(promotion.startsAt) >= new Date(promotion.endsAt)) {
    const error = new Error('促销结束时间必须晚于开始时间');
    error.statusCode = 400;
    throw error;
  }

  const rows = await repository.listPaymentPromotions(pool, {
    productId: promotion.productId,
    status: 'active'
  });
  const nextStart = promotion.startsAt ? new Date(promotion.startsAt).getTime() : Number.NEGATIVE_INFINITY;
  const nextEnd = promotion.endsAt ? new Date(promotion.endsAt).getTime() : Number.POSITIVE_INFINITY;
  const overlaps = rows.some((row) => {
    if (Number(row.id) === Number(promotion.id)) return false;
    const rowStart = row.starts_at ? new Date(row.starts_at).getTime() : Number.NEGATIVE_INFINITY;
    const rowEnd = row.ends_at ? new Date(row.ends_at).getTime() : Number.POSITIVE_INFINITY;
    return nextStart <= rowEnd && rowStart <= nextEnd;
  });
  if (promotion.status === 'active' && overlaps) {
    const error = new Error('同一档位同一时间只能有一个有效促销');
    error.statusCode = 400;
    throw error;
  }
};

const createAdminPaymentPromotion = async (payload = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const promotion = normalizePromotionPayload(payload);
  await validatePromotionInput(pool, promotion);
  const [result] = await repository.createPaymentPromotion(pool, promotion);
  await repository.updatePaymentPromotion(pool, {
    ...promotion,
    id: result.insertId,
    claimScopeKey: `promotion_${result.insertId}`
  });
  const row = await repository.getPaymentPromotionById(pool, result.insertId);
  return { promotion: mapPromotion(row) };
};

const updateAdminPaymentPromotion = async (payload = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const current = await repository.getPaymentPromotionById(pool, Number(payload.id || 0));
  if (!current) {
    const error = new Error('促销不存在');
    error.statusCode = 404;
    throw error;
  }

  const promotion = normalizePromotionPayload({
    ...payload,
    productId: current.product_id
  });
  promotion.claimScopeKey = current.claim_scope_key || `promotion_${current.id}`;
  await validatePromotionInput(pool, promotion);
  await repository.updatePaymentPromotion(pool, promotion);
  const row = await repository.getPaymentPromotionById(pool, promotion.id);
  return { promotion: mapPromotion(row) };
};

const buildOrderProductSnapshot = async ({ productId, durationId, userId, ignorePromotion = false } = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  await closeExpiredOrdersAndClaims(pool);
  const normalizedProductId = Number(productId || 0);
  const product = Number.isInteger(normalizedProductId) && normalizedProductId > 0
    ? await repository.getPaymentProductById(pool, normalizedProductId)
    : await repository.getPaymentProductBySkuId(pool, String(productId || '').trim());
  if (!product || product.status !== 'active') {
    const error = new Error('支付款项无效');
    error.statusCode = 400;
    throw error;
  }

  const duration = product.product_type === 'subscription'
    ? getPaymentDuration(durationId || '1m')
    : { id: 'one_time', label: '一次性', months: 1 };
  if (!duration) {
    const error = new Error('开通周期无效');
    error.statusCode = 400;
    throw error;
  }

  const stats = await repository.getRedeemCodeStats(pool);
  const availableFor = buildInventory(stats);
  const redeemedSkuSet = await buildRedeemedSkuSet(pool, userId);
  const promotion = ignorePromotion ? null : await getEffectivePromotionForProduct(pool, product.id, { userId });
  const mapped = mapProductRow(product, {
    promotion,
    availableFor,
    redeemedSkuSet
  });
  const normalizedBonusQuotaUsd = mapped.bonusRedeemCodeUsed ? '0.00' : mapped.bonusQuotaUsd;
  const normalizedQuotaUsd = product.product_type === 'recharge'
    ? (Number(mapped.baseQuotaUsd) + Number(normalizedBonusQuotaUsd)).toFixed(2)
    : mapped.baseQuotaUsd;
  const amount = product.product_type === 'subscription'
    ? fromCents(toCents(mapped.price) * Number(duration.months || 1))
    : mapped.price;
  const quotaUsd = product.product_type === 'recharge'
    ? normalizedQuotaUsd
    : normalizedBonusQuotaUsd;
  const snapshot = {
    ...mapped,
    bonusQuotaUsd: normalizedBonusQuotaUsd,
    quotaUsd: normalizedQuotaUsd,
    price: amount,
    displayPrice: amount,
    durationId: duration.id,
    durationLabel: duration.label,
    durationMonths: duration.months
  };

  return {
    product: snapshot,
    duration,
    promotion,
    productSnapshotJson: JSON.stringify(snapshot),
    promotionSnapshotJson: mapped.activePromotion ? JSON.stringify(mapped.activePromotion) : null,
    quotaUsd
  };
};

const getRedeemCodeProducts = async (pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const products = await repository.listPaymentProducts(pool, {});
  const bonusPackage = getRechargeBonusPackage();
  const seen = new Set();
  const options = [];
  const addOption = (productType, skuId, label) => {
    const normalizedSkuId = String(skuId || '').trim();
    if (!normalizedSkuId || seen.has(`${productType}:${normalizedSkuId}`)) return;
    seen.add(`${productType}:${normalizedSkuId}`);
    options.push({ productType, skuId: normalizedSkuId, label });
  };

  products.forEach((product) => {
    if (product.product_type === 'recharge') {
      addOption('recharge', product.sku_id, product.name);
      addOption('recharge', product.main_redeem_sku_id, `${product.name}兑换码`);
    }
    const bonusLabel = product.bonus_redeem_sku_id === bonusPackage.id
      ? bonusPackage.name
      : `${product.name}赠送码`;
    addOption('recharge', product.bonus_redeem_sku_id, bonusLabel);
  });
  return options;
};

module.exports = {
  seedDefaultPaymentProducts,
  getCatalog,
  listAdminPaymentProducts,
  createAdminPaymentProduct,
  updateAdminPaymentProduct,
  copyAdminPaymentProduct,
  createAdminPaymentPromotion,
  updateAdminPaymentPromotion,
  buildOrderProductSnapshot,
  getRedeemCodeProducts
};
