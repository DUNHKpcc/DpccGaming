const { getPool } = require('../../config/database');
const paymentProductService = require('./paymentProductService');

const getCatalog = async (options = {}, pool = getPool()) => {
  return paymentProductService.getCatalog(options, pool);
};

const getRedeemCodeCatalog = async (pool = getPool()) => ({
  products: await paymentProductService.getRedeemCodeProducts(pool)
});

module.exports = {
  getCatalog,
  getRedeemCodeCatalog
};
