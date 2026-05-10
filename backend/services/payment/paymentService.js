const {
  getCatalog,
  getRedeemCodeCatalog
} = require('./paymentCatalogService');
const {
  importRedeemCodes,
  listRedeemCodes,
  getRedeemCodeSecret,
  deleteRedeemCode,
  deleteRedeemCodes
} = require('./redeemCodeService');
const {
  getPaymentOrderResult,
  listAdminPaymentOrders,
  getAdminPaymentOrderDetail,
  deleteAdminPaymentOrder,
  submitPaymentOrderApiUsername
} = require('./paymentOrderQueryService');
const {
  createAlipayOrder,
  handleAlipayNotify,
  parseAlipayPaymentDate
} = require('./alipayOrderService');
const {
  handlePaidOrder
} = require('./paymentFulfillmentService');
const {
  listAdminPaymentProducts,
  createAdminPaymentProduct,
  updateAdminPaymentProduct,
  copyAdminPaymentProduct,
  createAdminPaymentPromotion,
  updateAdminPaymentPromotion
} = require('./paymentProductService');
const {
  toMysqlDateTime,
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL
} = require('./paymentUtils');

module.exports = {
  getCatalog,
  getRedeemCodeCatalog,
  importRedeemCodes,
  listRedeemCodes,
  getRedeemCodeSecret,
  deleteRedeemCode,
  deleteRedeemCodes,
  getPaymentOrderResult,
  listAdminPaymentOrders,
  getAdminPaymentOrderDetail,
  deleteAdminPaymentOrder,
  submitPaymentOrderApiUsername,
  listAdminPaymentProducts,
  createAdminPaymentProduct,
  updateAdminPaymentProduct,
  copyAdminPaymentProduct,
  createAdminPaymentPromotion,
  updateAdminPaymentPromotion,
  createAlipayOrder,
  handleAlipayNotify,
  handlePaidOrder,
  parseAlipayPaymentDate,
  toMysqlDateTime,
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL
};
