const { getPool } = require('../../config/database');
const repository = require('../../repositories/paymentRepository');
const {
  getRechargeBonusPackage,
  listPaymentPlans,
  listPaymentDurations,
  listRechargePackages
} = require('./plans');

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

const buildUserRedeemedSkuSet = async (pool, userId) => {
  const normalizedUserId = Number(userId || 0);
  if (!Number.isInteger(normalizedUserId) || normalizedUserId <= 0) return new Set();

  const rows = await repository.listAssignedRedeemCodeSkusForUser(pool, normalizedUserId);
  return new Set(rows.map((row) => `${row.product_type}:${row.sku_id}`));
};

const getCatalog = async (options = {}, pool = getPool()) => {
  await repository.ensurePaymentTables(pool);
  const inventory = buildRedeemCodeInventory(await repository.getRedeemCodeStats(pool));
  const redeemedSkuSet = await buildUserRedeemedSkuSet(pool, options.userId);
  const hasRedeemed = (productType, skuId) => redeemedSkuSet.has(`${productType}:${skuId}`);

  return {
    plans: listPaymentPlans().map((plan) => ({
      ...plan,
      bonusRedeemCodesAvailable: inventory.bonusAvailable,
      bonusRedeemCodeUsed: hasRedeemed('recharge', inventory.bonusPackage.id)
    })),
    durations: listPaymentDurations(),
    rechargePackages: listRechargePackages().map((pack) => ({
      ...pack,
      availableRedeemCodes: inventory.availableFor('recharge', pack.id),
      bonusRedeemCodesAvailable: inventory.bonusAvailable,
      bonusRedeemCodeUsed: hasRedeemed('recharge', inventory.bonusPackage.id)
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

module.exports = {
  getCatalog,
  getRedeemCodeCatalog
};
