const { getPool } = require('../../config/database');
const repository = require('../../repositories/paymentRepository');
const {
  getRechargePackage,
  getRechargeBonusPackage
} = require('./plans');
const {
  encryptRedeemCode,
  decryptRedeemCode
} = require('./redeemCodeCrypto');
const {
  normalizeRedeemCodes,
  normalizeRedeemCodeIds,
  maskRedeemCode
} = require('./paymentUtils');

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

module.exports = {
  importRedeemCodes,
  listRedeemCodes,
  getRedeemCodeSecret,
  deleteRedeemCode,
  deleteRedeemCodes
};
