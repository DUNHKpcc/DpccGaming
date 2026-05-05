const paymentService = require('../services/payment/paymentService');

const getRedeemCodeCatalog = (req, res) => {
  res.json(paymentService.getRedeemCodeCatalog());
};

const listRedeemCodes = async (req, res) => {
  try {
    const result = await paymentService.listRedeemCodes({
      productType: req.query.productType,
      skuId: req.query.skuId,
      status: req.query.status
    });

    res.json(result);
  } catch (error) {
    console.error('获取兑换码列表失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '获取兑换码列表失败'
    });
  }
};

const importRedeemCodes = async (req, res) => {
  try {
    const result = await paymentService.importRedeemCodes({
      productType: req.body?.productType,
      skuId: req.body?.skuId,
      codes: req.body?.codes
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('导入兑换码失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '导入兑换码失败'
    });
  }
};

module.exports = {
  getRedeemCodeCatalog,
  listRedeemCodes,
  importRedeemCodes
};
