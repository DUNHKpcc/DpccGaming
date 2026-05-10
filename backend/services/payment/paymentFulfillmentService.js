const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  getRechargeBonusPackage
} = require('./plans');
const { parseSnapshotJson, normalizeQuota } = require('./paymentProductUtils');
const { decryptRedeemCode } = require('./redeemCodeCrypto');
const {
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL,
  PAYMENT_API_USERNAME_WAIT_NOTE,
  BONUS_REDEEM_CODE_ALREADY_USED_NOTE,
  BONUS_REDEEM_CODE_PAYER_MISSING_NOTE,
  PROMOTION_PAYER_ALREADY_USED_NOTE,
  PROMOTION_PAYER_MISSING_NOTE,
  toMysqlDateTime,
  addMonths,
  isPaymentAfterOrderExpiry,
  buildRedeemCodes
} = require('./paymentUtils');
const {
  acquirePayerClaim,
  acquireUserAndPayerClaims,
  releaseClaims
} = require('./paymentClaimService');

const closeExpiredPaymentOrder = async (executor, orderNo = '', now = new Date()) => {
  const [result] = await repository.closeExpiredPaymentOrder(executor, {
    orderNo,
    now: toMysqlDateTime(now)
  });
  if (Number(result?.affectedRows || 0) > 0) {
    await repository.deletePaymentBonusClaimsByOrderNo(executor, orderNo);
  }
  return [result];
};

const getOrderProductSnapshot = (order = {}) => parseSnapshotJson(order.product_snapshot_json) || {};

const getOrderPromotionSnapshot = (order = {}) => parseSnapshotJson(order.promotion_snapshot_json) || {};

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

const getBonusSkipNote = (assignment = {}) => (
  assignment.skipReason === 'payer_missing'
    ? BONUS_REDEEM_CODE_PAYER_MISSING_NOTE
    : BONUS_REDEEM_CODE_ALREADY_USED_NOTE
);

const assignBonusRedeemCode = async (connection, order = {}, assignedAt = new Date(), options = {}) => {
  const productSnapshot = options.productSnapshot || getOrderProductSnapshot(order);
  const bonusSkuId = productSnapshot.bonusRedeemSkuId || getRechargeBonusPackage().id;
  const bonusQuotaUsd = Number(productSnapshot.bonusQuotaUsd ?? order.quota_usd ?? 0);
  if (!bonusSkuId || bonusQuotaUsd <= 0) {
    return {
      assignedCode: null,
      redeemCode: null,
      alreadyUsed: true,
      skipReason: 'already_used'
    };
  }

  const alreadyUsedByUser = await hasUserRedeemedSku(connection, {
    userId: order.user_id,
    productType: 'recharge',
    skuId: bonusSkuId
  });
  if (alreadyUsedByUser) {
    return {
      assignedCode: null,
      redeemCode: null,
      alreadyUsed: true,
      skipReason: 'already_used'
    };
  }

  const claim = await acquireUserAndPayerClaims(connection, {
    purpose: 'bonus',
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
    skuId: bonusSkuId,
    orderNo: order.order_no,
    userId: order.user_id,
    assignedAt: toMysqlDateTime(assignedAt)
  });
  if (!assignedCode) {
    await releaseClaims(connection, {
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
  const productSnapshot = options.productSnapshot || getOrderProductSnapshot(order);
  const skuId = productType === 'recharge'
    ? productSnapshot.mainRedeemSkuId || order.plan_id
    : order.plan_id;
  const assignedAtText = toMysqlDateTime(assignedAt);
  const assignCode = (targetSkuId) => repository.assignRedeemCodeToOrder(connection, {
    productType,
    skuId: targetSkuId,
    orderNo: order.order_no,
    userId: order.user_id,
    assignedAt: assignedAtText
  });
  const assignedCode = await assignCode(skuId);
  const bonusAssignment = assignedCode ? await assignBonusRedeemCode(connection, order, assignedAt, {
    ...options,
    productSnapshot
  }) : {};
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

const acquirePromotionPayerClaim = async (connection, order = {}, payload = {}) => {
  const promotionSnapshot = getOrderPromotionSnapshot(order);
  if (!promotionSnapshot.limitOnce) {
    return { claimed: true, claims: [], promotionSnapshot: null };
  }

  const claimResult = await acquirePayerClaim(connection, {
    purpose: promotionSnapshot.claimScopeKey || `promotion_${promotionSnapshot.id}`,
    alipayBuyerId: payload.alipayBuyerId,
    orderNo: order.order_no,
    userId: order.user_id
  });

  return {
    ...claimResult,
    promotionSnapshot
  };
};

const setPromotionManualReview = async (connection, order = {}, payerClaim = {}) => {
  const supportNote = payerClaim.reason === 'payer_missing'
    ? PROMOTION_PAYER_MISSING_NOTE
    : PROMOTION_PAYER_ALREADY_USED_NOTE;

  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus: 'manual_required',
    redeemCodeId: null,
    bonusRedeemCodeId: null,
    redeemCode: null,
    bonusRedeemCode: null,
    redeemUrl: null,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote
  });

  return {
    fulfillmentStatus: 'manual_required',
    redeemCode: null,
    bonusRedeemCode: null,
    redeemCodes: [],
    promotionPayerRejected: true,
    promotionPayerRejectReason: payerClaim.reason || 'already_used',
    redeemUrl: '',
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
    const productSnapshot = getOrderProductSnapshot(order);
    const promotionPayerClaim = await acquirePromotionPayerClaim(connection, order, {
      alipayBuyerId: payload.alipayBuyerId
    });
    const plan = getPaymentPlan(order.plan_id);
    const duration = getPaymentDuration(productSnapshot.durationId || order.duration_id) || {
      id: productSnapshot.durationId || order.duration_id,
      label: productSnapshot.durationLabel || '',
      months: Number(productSnapshot.durationMonths || 0)
    };
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
    if (!promotionPayerClaim.claimed) {
      const fulfillment = await setPromotionManualReview(connection, order, promotionPayerClaim);
      await connection.commit();
      transactionClosed = true;
      return {
        status: 'paid',
        orderNo: order.order_no,
        productType,
        alreadyPaid: false,
        ...fulfillment
      };
    }

    if (productType === 'recharge') {
      const fulfillment = await assignPaymentFulfillment(connection, order, productType, paidAt, {
        alipayBuyerId: payload.alipayBuyerId,
        productSnapshot
      });

      if (!rechargePackage && !productSnapshot.mainRedeemSkuId) {
        const error = new Error('订单充值配置不存在');
        error.statusCode = 500;
        throw error;
      }

      const baseQuotaUsd = normalizeQuota(productSnapshot.baseQuotaUsd || rechargePackage?.originalQuotaUsd || order.quota_usd || rechargePackage?.quotaUsd);
      const grantedQuotaUsd = fulfillment.bonusSkipReason
        ? baseQuotaUsd
        : normalizeQuota(order.quota_usd || productSnapshot.quotaUsd || rechargePackage?.quotaUsd);
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

    if (!plan && !productSnapshot.dailyQuotaUsd) {
      const error = new Error('订单套餐配置不存在');
      error.statusCode = 500;
      throw error;
    }
    if (!duration?.months) {
      const error = new Error('订单周期配置不存在');
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
      dailyQuotaUsd: productSnapshot.dailyQuotaUsd || plan.dailyQuotaUsd,
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
      alipayBuyerId: payload.alipayBuyerId,
      productSnapshot
    });
    const bonusQuotaUsd = bonusAssignment.skipReason
      ? 0
      : Number(productSnapshot.bonusQuotaUsd ?? order.quota_usd ?? plan.bonusQuotaUsd ?? 0);
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
