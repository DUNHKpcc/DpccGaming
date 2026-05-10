const { getPool } = require('../../config/database');
const {
  getRechargeBonusPackage,
  listRechargePackages
} = require('./plans');
const paymentProductService = require('./paymentProductService');

const getCatalog = async (options = {}, pool = getPool()) => {
  return paymentProductService.getCatalog(options, pool);
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
