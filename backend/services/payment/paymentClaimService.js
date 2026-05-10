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
    : `${normalizedPurpose}_${normalizedScope}`.slice(0, 24);
  return {
    claimType,
    claimKey: String(key || '').trim()
  };
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

  const payerClaim = buildScopedClaim(payload.purpose || 'bonus', 'alipay_buyer', normalizedBuyerId);
  const payerClaimed = await createClaim(executor, {
    ...payerClaim,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  if (!payerClaimed) {
    await releaseClaims(executor, {
      orderNo: payload.orderNo,
      claims: userResult.claims
    });
    return { claimed: false, reason: 'already_used' };
  }

  return {
    claimed: true,
    claims: [...userResult.claims, payerClaim]
  };
};

module.exports = {
  createClaim,
  releaseClaim,
  releaseClaims,
  buildScopedClaim,
  acquireUserClaim,
  acquireUserAndPayerClaims
};
