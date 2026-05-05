const paymentService = require('../services/payment/paymentService');

const getPaymentCatalog = (req, res) => {
  res.json(paymentService.getCatalog());
};

const createAlipayOrder = async (req, res) => {
  try {
    const result = await paymentService.createAlipayOrder({
      userId: req.user.userId,
      productType: req.body?.productType,
      planId: req.body?.planId,
      durationId: req.body?.durationId,
      rechargePackageId: req.body?.rechargePackageId
    });

    res.json(result);
  } catch (error) {
    console.error('创建支付宝订单失败:', error);
    res.status(error.statusCode || 500).json({
      message: error.message || '创建支付订单失败'
    });
  }
};

const getPaymentOrderResult = async (req, res) => {
  try {
    const result = await paymentService.getPaymentOrderResult({
      userId: req.user.userId,
      orderNo: req.params.orderNo
    });

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: error.message || '查询支付结果失败'
    });
  }
};

const handleAlipayNotify = async (req, res) => {
  try {
    await paymentService.handleAlipayNotify(req.body || {});
    res.type('text/plain').send('success');
  } catch (error) {
    console.error('处理支付宝异步通知失败:', error);
    res.type('text/plain').send('fail');
  }
};

module.exports = {
  getPaymentCatalog,
  createAlipayOrder,
  getPaymentOrderResult,
  handleAlipayNotify
};
