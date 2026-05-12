const repository = require('../../repositories/paymentRepository');
const {
  BONUS_CLAIM_TYPE_ALIPAY_BUYER,
  BONUS_CLAIM_TYPE_USER
} = require('./paymentUtils');

const createClaim = async (executor, payload = {}) => {
  const [result] = await repository.createPaymentBonusClaim(executor, {
    claimType: payload.claimType,
    claimKey: payload.claimKey,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  return Number(result?.affectedRows || 0) === 1;
};

const releaseClaim = (executor, payload = {}) => {
  if (!payload.claimType || !payload.claimKey) return Promise.resolve();
  return repository.deletePaymentBonusClaim(executor, {
    claimType: payload.claimType,
    claimKey: payload.claimKey,
    orderNo: payload.orderNo
  });
};

const releaseClaims = async (executor, payload = {}) => {
  const claims = Array.isArray(payload.claims) ? payload.claims : [];
  for (const claim of claims) {
    await releaseClaim(executor, {
      ...claim,
      orderNo: payload.orderNo
    });
  }
};

const buildScopedClaim = (purpose = '', scope = '', key = '') => {
  const normalizedPurpose = String(purpose || '').trim();
  const normalizedScope = String(scope || '').trim();
  const claimType = normalizedPurpose === 'bonus'
    ? (normalizedScope === 'alipay_buyer' ? BONUS_CLAIM_TYPE_ALIPAY_BUYER : BONUS_CLAIM_TYPE_USER)
    : `scoped_${normalizedScope || 'user'}`;
  const claimKey = normalizedPurpose === 'bonus'
    ? String(key || '').trim()
    : `${normalizedPurpose}:${String(key || '').trim()}`;
  return {
    claimType,
    claimKey
  };
};

const buildLegacyPromotionClaimPurpose = (promotion = {}) => (
  String(
    promotion.claimScopeKey
    ?? promotion.claim_scope_key
    ?? ''
  ).trim() || `promotion_${promotion.id}`
);

const buildPromotionClaimPurpose = (promotion = {}) => {
  const productId = Number(promotion.productId ?? promotion.product_id ?? 0);
  const scopeKey = buildLegacyPromotionClaimPurpose(promotion);
  return productId > 0 ? `product_${productId}:${scopeKey}` : scopeKey;
};

const hasPayerClaimedBonusRedeemCode = async (executor, payload = {}) => {
  const normalizedBuyerId = String(payload.alipayBuyerId || '').trim();
  if (!normalizedBuyerId) return false;

  const claim = await repository.getBonusRedeemCodeClaimByPayer(executor, {
    alipayBuyerId: normalizedBuyerId,
    currentOrderNo: payload.currentOrderNo
  });
  return Boolean(claim);
};

const acquireUserClaim = async (executor, payload = {}) => {
  const userClaimKey = String(Number(payload.userId || 0));
  if (!userClaimKey || userClaimKey === '0') {
    return { claimed: false, reason: 'user_missing' };
  }

  const claim = buildScopedClaim(payload.purpose || 'bonus', 'user', userClaimKey);
  const claimed = await createClaim(executor, {
    ...claim,
    orderNo: payload.orderNo,
    userId: payload.userId
  });

  return claimed
    ? { claimed: true, claims: [claim] }
    : { claimed: false, reason: 'already_used' };
};

const acquirePayerClaim = async (executor, payload = {}) => {
  const normalizedBuyerId = String(payload.alipayBuyerId || '').trim();
  if (!normalizedBuyerId) {
    return { claimed: false, reason: 'payer_missing' };
  }

  const claim = buildScopedClaim(payload.purpose || 'bonus', 'alipay_buyer', normalizedBuyerId);
  const claimed = await createClaim(executor, {
    ...claim,
    orderNo: payload.orderNo,
    userId: payload.userId
  });

  return claimed
    ? { claimed: true, claims: [claim] }
    : { claimed: false, reason: 'already_used' };
};

const acquireUserAndPayerClaims = async (executor, payload = {}) => {
  const userResult = await acquireUserClaim(executor, payload);
  if (!userResult.claimed) return userResult;

  const normalizedBuyerId = String(payload.alipayBuyerId || '').trim();
  if (!normalizedBuyerId) {
    await releaseClaims(executor, {
      orderNo: payload.orderNo,
      claims: userResult.claims
    });
    return { claimed: false, reason: 'payer_missing' };
  }

  if ((payload.purpose || 'bonus') === 'bonus' && await hasPayerClaimedBonusRedeemCode(executor, {
    alipayBuyerId: normalizedBuyerId,
    currentOrderNo: payload.orderNo
  })) {
    await releaseClaims(executor, {
      orderNo: payload.orderNo,
      claims: userResult.claims
    });
    return { claimed: false, reason: 'already_used' };
  }

  const payerResult = await acquirePayerClaim(executor, {
    ...payload,
    alipayBuyerId: normalizedBuyerId
  });
  if (!payerResult.claimed) {
    await releaseClaims(executor, {
      orderNo: payload.orderNo,
      claims: userResult.claims
    });
    return payerResult;
  }

  return {
    claimed: true,
    claims: [...userResult.claims, ...payerResult.claims]
  };
};

module.exports = {
  createClaim,
  releaseClaim,
  releaseClaims,
  buildScopedClaim,
  buildLegacyPromotionClaimPurpose,
  buildPromotionClaimPurpose,
  acquireUserClaim,
  acquirePayerClaim,
  acquireUserAndPayerClaims
};
