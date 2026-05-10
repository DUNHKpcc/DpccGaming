const normalizeMoney = (value, fallback = '0.00') => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : fallback;
};

const normalizeQuota = (value, fallback = '0.00') => normalizeMoney(value, fallback);

const toCents = (value) => Math.round(Number(value || 0) * 100);

const fromCents = (value) => (Number(value || 0) / 100).toFixed(2);

const normalizeProductType = (value = '') => (value === 'recharge' ? 'recharge' : 'subscription');

const parseJsonArray = (value, fallback = []) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || '').trim()).filter(Boolean);
  }
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.map((item) => String(item || '').trim()).filter(Boolean)
      : fallback;
  } catch {
    return fallback;
  }
};

const stringifyJsonArray = (value = []) => JSON.stringify(parseJsonArray(value));

const parseSnapshotJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const parseDateTime = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value).replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? date : null;
};

const isPromotionActive = (promotion = {}, now = new Date()) => {
  if (!promotion || promotion.status !== 'active') return false;
  const current = parseDateTime(now);
  if (!current) return false;
  const startsAt = parseDateTime(promotion.starts_at || promotion.startsAt);
  const endsAt = parseDateTime(promotion.ends_at || promotion.endsAt);
  if (startsAt && current < startsAt) return false;
  if (endsAt && current > endsAt) return false;
  return true;
};

const resolveEffectiveProduct = (product = {}, promotion = null, now = new Date()) => {
  const activePromotion = promotion && isPromotionActive(promotion, now) ? promotion : null;
  const basePrice = normalizeMoney(product.base_price ?? product.basePrice);
  const promotionPrice = activePromotion?.promotion_price ?? activePromotion?.promotionPrice;
  const displayPrice = activePromotion && promotionPrice !== null && promotionPrice !== undefined
    ? normalizeMoney(promotionPrice, basePrice)
    : basePrice;
  const baseQuotaUsd = normalizeQuota(product.base_quota_usd ?? product.baseQuotaUsd);
  const defaultBonusQuota = product.bonus_quota_usd ?? product.bonusQuotaUsd;
  const bonusQuotaUsd = activePromotion
    ? normalizeQuota(activePromotion.promotion_bonus_quota_usd ?? activePromotion.promotionBonusQuotaUsd ?? defaultBonusQuota)
    : normalizeQuota(defaultBonusQuota);

  return {
    basePrice,
    displayPrice,
    baseQuotaUsd,
    bonusQuotaUsd,
    activePromotion
  };
};

module.exports = {
  normalizeMoney,
  normalizeQuota,
  toCents,
  fromCents,
  normalizeProductType,
  parseJsonArray,
  stringifyJsonArray,
  parseSnapshotJson,
  isPromotionActive,
  resolveEffectiveProduct
};
