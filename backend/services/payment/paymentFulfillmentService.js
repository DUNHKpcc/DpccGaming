const repository = require('../../repositories/paymentRepository');
const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  getRechargeBonusPackage
} = require('./plans');
const { normalizeProductType, parseSnapshotJson, normalizeQuota, toCents } = require('./paymentProductUtils');
const { decryptRedeemCode } = require('./redeemCodeCrypto');
const {
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL,
  PAYMENT_API_USERNAME_WAIT_NOTE,
  PAYMENT_ACCOUNT_TARGET_WAIT_NOTE,
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
  buildLegacyPromotionClaimPurpose,
  buildPromotionClaimPurpose,
  buildScopedClaim,
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

const setAccountTargetRequired = async (connection, order = {}) => {
  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus: 'username_required',
    redeemCodeId: null,
    bonusRedeemCodeId: null,
    redeemCode: null,
    bonusRedeemCode: null,
    redeemUrl: null,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_ACCOUNT_TARGET_WAIT_NOTE
  });

  return {
    fulfillmentStatus: 'username_required',
    redeemCode: null,
    bonusRedeemCode: null,
    redeemCodes: [],
    redeemUrl: '',
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: PAYMENT_ACCOUNT_TARGET_WAIT_NOTE
  };
};

const acquirePromotionPayerClaim = async (connection, order = {}, payload = {}) => {
  const promotionSnapshot = getOrderPromotionSnapshot(order);
  if (!promotionSnapshot.limitOnce) {
    return { claimed: true, claims: [], promotionSnapshot: null };
  }

  const normalizedBuyerId = String(payload.alipayBuyerId || '').trim();
  if (normalizedBuyerId) {
    const legacyPayerClaim = buildScopedClaim(
      buildLegacyPromotionClaimPurpose(promotionSnapshot),
      'alipay_buyer',
      normalizedBuyerId
    );
    const legacyClaimRow = await repository.getPaymentBonusClaim(connection, legacyPayerClaim);
    if (legacyClaimRow?.order_no) {
      const legacyOrder = await repository.getPaymentOrderByNo(connection, legacyClaimRow.order_no);
      const legacyProductSnapshot = getOrderProductSnapshot(legacyOrder);
      if (Number(legacyProductSnapshot.id || 0) === Number(promotionSnapshot.productId || 0)) {
        return {
          claimed: false,
          reason: 'already_used',
          promotionSnapshot
        };
      }
    }
  }

  const claimResult = await acquirePayerClaim(connection, {
    purpose: buildPromotionClaimPurpose(promotionSnapshot),
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

const markOrderNeedsRefund = async (connection, order = {}, payload = {}, paidAt = new Date()) => {
  // 订单已超时付款（窗口外）：不发放，把支付宝交易号/付款人/付款时间补记到订单上，
  // 便于管理员核对并人工退款；同时打一条可被日志监控捕获的告警。
  await repository.recordPaymentMetadataOnOrder(connection, {
    orderNo: order.order_no,
    alipayTradeNo: payload.alipayTradeNo,
    alipayBuyerId: payload.alipayBuyerId,
    paidAt: toMysqlDateTime(paidAt)
  });
  await repository.updatePaymentOrderFulfillment(connection, {
    orderNo: order.order_no,
    fulfillmentStatus: 'manual_required',
    redeemCodeId: null,
    bonusRedeemCodeId: null,
    redeemCode: null,
    bonusRedeemCode: null,
    redeemUrl: null,
    supportWechat: PAYMENT_SUPPORT_WECHAT,
    supportNote: '订单已超时付款，已记录支付宝交易号，需人工退款，请联系售后'
  });
  console.error('[PAYMENT-REFUND-REQUIRED] 订单超时付款需人工退款:', {
    orderNo: order.order_no,
    alipayTradeNo: payload.alipayTradeNo,
    alipayBuyerId: payload.alipayBuyerId,
    paidAt: paidAt instanceof Date ? paidAt.toISOString() : String(paidAt),
    amount: order.amount
  });
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
      error.nonRetryable = true;
      throw error;
    }

    if (toCents(order.amount) <= 0 || toCents(order.amount) !== toCents(payload.totalAmount)) {
      const error = new Error('支付金额不匹配');
      error.statusCode = 400;
      error.nonRetryable = true;
      throw error;
    }

    // 支付宝交易号全局唯一校验放在所有状态分支之前：无论本单是 pending/closed/paid，
    // 同一个 trade_no 都只能关联一个订单。提前锁定也避免下面给已关闭订单补记 trade_no 时撞唯一索引。
    const tradeOrder = await repository.getPaymentOrderByTradeNoForUpdate(connection, payload.alipayTradeNo);
    if (tradeOrder && tradeOrder.order_no !== order.order_no) {
      const error = new Error('支付宝交易号已关联其他订单');
      error.statusCode = 409;
      error.nonRetryable = true;
      throw error;
    }

    if (order.status === 'paid') {
      if (order.alipay_trade_no && order.alipay_trade_no !== payload.alipayTradeNo) {
        const error = new Error('已支付订单的支付宝交易号不匹配');
        error.statusCode = 409;
        error.nonRetryable = true;
        throw error;
      }
      await connection.commit();
      transactionClosed = true;
      return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
    }
    const paidAt = payload.paidAt || new Date();
    const paidAfterExpiry = isPaymentAfterOrderExpiry(order, paidAt);

    // 已关闭订单收到合法（验签通过）回调：通常是回调延迟/重试，订单先被过期关闭。
    if (order.status === 'closed') {
      if (paidAfterExpiry) {
        // 确实超期付款：不发放，记录付款信息并告警，等待人工退款。
        await markOrderNeedsRefund(connection, order, payload, paidAt);
        await connection.commit();
        transactionClosed = true;
        return { status: 'closed', orderNo: order.order_no, expired: true, needsRefund: true };
      }
      // 付款实际落在有效窗口内（延迟回调竞态）：重开为 pending，走正常履约。
      await repository.reopenClosedPaymentOrder(connection, order.order_no);
      order.status = 'pending';
    }

    if (order.status !== 'pending') {
      const error = new Error('支付订单不是待支付状态');
      error.statusCode = 400;
      error.nonRetryable = true;
      throw error;
    }

    if (paidAfterExpiry) {
      // pending 订单但付款超期：关闭、记录、告警，等待人工退款。
      await closeExpiredPaymentOrder(connection, order.order_no, paidAt);
      await markOrderNeedsRefund(connection, order, payload, paidAt);
      await connection.commit();
      transactionClosed = true;
      return { status: 'closed', orderNo: order.order_no, expired: true, needsRefund: true };
    }

    const productType = normalizeProductType(order.product_type);
    if (!productType) {
      const error = new Error('订单商品类型无效');
      error.statusCode = 500;
      throw error;
    }
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
    let markResult;
    try {
      [markResult] = await repository.markOrderPaid(connection, {
        orderNo: payload.orderNo,
        alipayTradeNo: payload.alipayTradeNo,
        alipayBuyerId: payload.alipayBuyerId,
        paidAt: toMysqlDateTime(paidAt)
      });
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') {
        const conflictError = new Error('支付宝交易号已关联其他订单');
        conflictError.statusCode = 409;
        conflictError.nonRetryable = true;
        throw conflictError;
      }
      throw error;
    }
    if (!markResult || markResult.affectedRows !== 1) {
      const latestOrder = await repository.getPaymentOrderByNoForUpdate(connection, payload.orderNo);
      if (latestOrder?.status === 'paid') {
        await connection.commit();
        transactionClosed = true;
        return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
      }
      const error = new Error('支付订单不是待支付状态');
      error.statusCode = 400;
      error.nonRetryable = true;
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

    if (productType === 'account') {
      const fulfillment = await setAccountTargetRequired(connection, order);
      await connection.commit();
      transactionClosed = true;
      return { status: 'paid', orderNo: order.order_no, productType, alreadyPaid: false, ...fulfillment };
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
