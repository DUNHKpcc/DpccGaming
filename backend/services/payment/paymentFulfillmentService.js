const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  getRechargeBonusPackage
} = require('./plans');
const { decryptRedeemCode } = require('./redeemCodeCrypto');
const {
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL,
  PAYMENT_API_USERNAME_WAIT_NOTE,
  BONUS_REDEEM_CODE_ALREADY_USED_NOTE,
  BONUS_REDEEM_CODE_PAYER_MISSING_NOTE,
  BONUS_CLAIM_TYPE_ALIPAY_BUYER,
  BONUS_CLAIM_TYPE_USER,
  toMysqlDateTime,
  addMonths,
  isPaymentAfterOrderExpiry,
  buildRedeemCodes
} = require('./paymentUtils');

const closeExpiredPaymentOrder = (executor, orderNo = '', now = new Date()) => repository.closeExpiredPaymentOrder(executor, {
  orderNo,
  now: toMysqlDateTime(now)
});

const hasUserRedeemedSku = async (executor, payload = {}) => {
  const normalizedUserId = Number(payload.userId || 0);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return false;

  const assignedCode = await repository.getAssignedRedeemCodeForUserSku(executor, {
    userId: normalizedUserId,
    productType: payload.productType,
    skuId: payload.skuId
  });
  return Boolean(assignedCode);
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

const createBonusClaim = async (executor, payload = {}) => {
  const [result] = await repository.createPaymentBonusClaim(executor, {
    claimType: payload.claimType,
    claimKey: payload.claimKey,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  return Number(result?.affectedRows || 0) === 1;
};

const releaseBonusClaim = (executor, payload = {}) => {
  if (!payload.claimKey) return Promise.resolve();
  return repository.deletePaymentBonusClaim(executor, {
    claimType: payload.claimType,
    claimKey: payload.claimKey,
    orderNo: payload.orderNo
  });
};

const createBonusClaims = async (executor, payload = {}) => {
  const userClaimKey = String(Number(payload.userId || 0));
  const userClaimed = await createBonusClaim(executor, {
    claimType: BONUS_CLAIM_TYPE_USER,
    claimKey: userClaimKey,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  if (!userClaimed) {
    return { claimed: false, reason: 'already_used' };
  }

  const normalizedBuyerId = String(payload.alipayBuyerId || '').trim();
  if (!normalizedBuyerId) {
    await releaseBonusClaim(executor, {
      claimType: BONUS_CLAIM_TYPE_USER,
      claimKey: userClaimKey,
      orderNo: payload.orderNo
    });
    return { claimed: false, reason: 'payer_missing' };
  }

  if (await hasPayerClaimedBonusRedeemCode(executor, {
    alipayBuyerId: normalizedBuyerId,
    currentOrderNo: payload.orderNo
  })) {
    await releaseBonusClaim(executor, {
      claimType: BONUS_CLAIM_TYPE_USER,
      claimKey: userClaimKey,
      orderNo: payload.orderNo
    });
    return { claimed: false, reason: 'already_used' };
  }

  const payerClaimed = await createBonusClaim(executor, {
    claimType: BONUS_CLAIM_TYPE_ALIPAY_BUYER,
    claimKey: normalizedBuyerId,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  if (!payerClaimed) {
    await releaseBonusClaim(executor, {
      claimType: BONUS_CLAIM_TYPE_USER,
      claimKey: userClaimKey,
      orderNo: payload.orderNo
    });
    return { claimed: false, reason: 'already_used' };
  }

  return {
    claimed: true,
    claims: [
      { claimType: BONUS_CLAIM_TYPE_USER, claimKey: userClaimKey },
      { claimType: BONUS_CLAIM_TYPE_ALIPAY_BUYER, claimKey: normalizedBuyerId }
    ]
  };
};

const releaseBonusClaims = async (executor, payload = {}) => {
  const claims = Array.isArray(payload.claims) ? payload.claims : [];
  for (const claim of claims) {
    await releaseBonusClaim(executor, {
      ...claim,
      orderNo: payload.orderNo
    });
  }
};

const getBonusSkipNote = (assignment = {}) => (
  assignment.skipReason === 'payer_missing'
    ? BONUS_REDEEM_CODE_PAYER_MISSING_NOTE
    : BONUS_REDEEM_CODE_ALREADY_USED_NOTE
);

const assignBonusRedeemCode = async (connection, order = {}, assignedAt = new Date(), options = {}) => {
  const bonusPackage = getRechargeBonusPackage();
  const alreadyUsedByUser = await hasUserRedeemedSku(connection, {
    userId: order.user_id,
    productType: 'recharge',
    skuId: bonusPackage.id
  });
  if (alreadyUsedByUser) {
    return {
      assignedCode: null,
      redeemCode: null,
      alreadyUsed: true,
      skipReason: 'already_used'
    };
  }

  const claim = await createBonusClaims(connection, {
    alipayBuyerId: options.alipayBuyerId,
    orderNo: order.order_no,
    userId: order.user_id
  });
  if (!claim.claimed) {
    return {
      assignedCode: null,
      redeemCode: null,
      alreadyUsed: claim.reason === 'already_used',
      skipReason: claim.reason
    };
  }

  const assignedCode = await repository.assignRedeemCodeToOrder(connection, {
    productType: 'recharge',
    skuId: bonusPackage.id,
    orderNo: order.order_no,
    userId: order.user_id,
    assignedAt: toMysqlDateTime(assignedAt)
  });
  if (!assignedCode) {
    await releaseBonusClaims(connection, {
      claims: claim.claims,
      orderNo: order.order_no
    });
  }

  return {
    assignedCode,
    redeemCode: assignedCode ? decryptRedeemCode(assignedCode) : null,
    alreadyUsed: false,
    skipReason: assignedCode ? '' : 'stock_empty'
  };
};

const assignPaymentFulfillment = async (connection, order = {}, productType = 'subscription', assignedAt = new Date(), options = {}) => {
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
  const bonusAssignment = assignedCode ? await assignBonusRedeemCode(connection, order, assignedAt, options) : {};
  const redeemCode = assignedCode ? decryptRedeemCode(assignedCode) : null;
  const bonusRedeemCode = bonusAssignment.redeemCode || null;
  const bonusAlreadyUsed = bonusAssignment.skipReason === 'already_used';
  const fulfillmentStatus = redeemCode && bonusRedeemCode
    ? 'code_assigned'
    : redeemCode && bonusAlreadyUsed
      ? 'bonus_skipped'
      : 'manual_required';
  const supportNote = bonusAssignment.skipReason && bonusAssignment.skipReason !== 'stock_empty'
    ? getBonusSkipNote(bonusAssignment)
    : PAYMENT_SUPPORT_NOTE;

  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus,
    redeemCodeId: assignedCode?.id || null,
    bonusRedeemCodeId: bonusAssignment.assignedCode?.id || null,
    redeemCode: null,
    bonusRedeemCode: null,
    redeemUrl: PAYMENT_REDEEM_URL,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote
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
    bonusRedeemCodeAlreadyUsed: Boolean(bonusAssignment.alreadyUsed),
    bonusSkipReason: bonusAssignment.skipReason || '',
    redeemUrl: PAYMENT_REDEEM_URL,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote
  };
};

const setSubscriptionUsernameRequired = async (connection, order = {}, bonusAssignment = {}) => {
  const redeemCodes = buildRedeemCodes({
    bonus_redeem_code: bonusAssignment.redeemCode
  });
  const hasBonusCode = Boolean(bonusAssignment.redeemCode);
  const bonusAlreadyUsed = bonusAssignment.skipReason === 'already_used';
  const fulfillmentStatus = hasBonusCode || bonusAlreadyUsed ? 'username_required' : 'manual_required';
  const supportNote = bonusAssignment.skipReason && bonusAssignment.skipReason !== 'stock_empty'
    ? getBonusSkipNote(bonusAssignment)
    : hasBonusCode
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

const handlePaidOrder = async (pool, payload = {}) => {
  await repository.ensurePaymentTables(pool);
  const connection = await pool.getConnection();
  let transactionClosed = false;

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
      transactionClosed = true;
      return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
    }
    const paidAt = payload.paidAt || new Date();
    if (!['pending', 'closed'].includes(order.status)) {
      const error = new Error('支付订单不是待支付状态');
      error.statusCode = 400;
      throw error;
    }
    if (isPaymentAfterOrderExpiry(order, paidAt)) {
      await closeExpiredPaymentOrder(connection, order.order_no, paidAt);
      await connection.commit();
      transactionClosed = true;
      return {
        status: 'closed',
        orderNo: order.order_no,
        expired: true
      };
    }

    const productType = order.product_type === 'recharge' ? 'recharge' : 'subscription';
    const plan = getPaymentPlan(order.plan_id);
    const duration = getPaymentDuration(order.duration_id);
    const rechargePackage = getRechargePackage(order.plan_id);
    const [markResult] = await repository.markOrderPaid(connection, {
      orderNo: payload.orderNo,
      alipayTradeNo: payload.alipayTradeNo,
      alipayBuyerId: payload.alipayBuyerId,
      paidAt: toMysqlDateTime(paidAt)
    });
    if (!markResult || markResult.affectedRows !== 1) {
      const latestOrder = await repository.getPaymentOrderByNoForUpdate(connection, payload.orderNo);
      if (latestOrder?.status === 'paid') {
        await connection.commit();
        transactionClosed = true;
        return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
      }
      const error = new Error('支付订单不是待支付状态');
      error.statusCode = 400;
      throw error;
    }

    if (productType === 'recharge') {
      const fulfillment = await assignPaymentFulfillment(connection, order, productType, paidAt, {
        alipayBuyerId: payload.alipayBuyerId
      });

      if (!rechargePackage) {
        const error = new Error('订单充值配置不存在');
        error.statusCode = 500;
        throw error;
      }

      const grantedQuotaUsd = fulfillment.bonusSkipReason
        ? rechargePackage.originalQuotaUsd || order.quota_usd || rechargePackage.quotaUsd
        : order.quota_usd || rechargePackage.quotaUsd;
      await repository.updatePaymentOrderQuota(connection, {
        orderNo: payload.orderNo,
        quotaUsd: grantedQuotaUsd
      });
      await repository.addUserBalance(connection, {
        userId: order.user_id,
        quotaUsd: grantedQuotaUsd,
        orderNo: payload.orderNo
      });

      await connection.commit();
      transactionClosed = true;
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

    const bonusAssignment = await assignBonusRedeemCode(connection, order, paidAt, {
      alipayBuyerId: payload.alipayBuyerId
    });
    const bonusQuotaUsd = bonusAssignment.skipReason ? 0 : Number(order.quota_usd || plan.bonusQuotaUsd || 0);
    if (bonusAssignment.skipReason) {
      await repository.updatePaymentOrderQuota(connection, {
        orderNo: payload.orderNo,
        quotaUsd: '0.00'
      });
    }
    if (bonusQuotaUsd > 0) {
      await repository.addUserBalance(connection, {
        userId: order.user_id,
        quotaUsd: bonusQuotaUsd.toFixed(2),
        orderNo: payload.orderNo
      });
    }

    const fulfillment = await setSubscriptionUsernameRequired(connection, order, bonusAssignment);

    await connection.commit();
    transactionClosed = true;
    return { status: 'paid', orderNo: order.order_no, alreadyPaid: false, ...fulfillment };
  } catch (error) {
    if (!transactionClosed) {
      await connection.rollback();
    }
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  handlePaidOrder,
  hasUserRedeemedSku
};
