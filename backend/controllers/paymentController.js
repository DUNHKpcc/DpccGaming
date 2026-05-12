const paymentService = require('../services/payment/paymentService');

const getClientIp = (req) => (
  Array.isArray(req.ips) && req.ips.length
    ? req.ips[0]
    : req.ip || req.connection?.remoteAddress || ''
);

const toPublicErrorMessage = (fallback = '请求失败') => (
  process.env.NODE_ENV === 'production' ? fallback : null
);

const getPaymentCatalog = async (req, res) => {
  try {
    res.json(await paymentService.getCatalog({
      userId: req.user?.userId
    }));
  } catch (error) {
    console.error('获取支付目录失败:', error);
    res.status(error.statusCode || 500).json({
      message: toPublicErrorMessage('获取支付目录失败') || error.message || '获取支付目录失败'
    });
  }
};

const createAlipayOrder = async (req, res) => {
  try {
    const result = await paymentService.createAlipayOrder({
      userId: req.user.userId,
      productType: req.body?.productType,
      productId: req.body?.productId,
      planId: req.body?.planId,
      durationId: req.body?.durationId,
      rechargePackageId: req.body?.rechargePackageId
    });

    res.json(result);
  } catch (error) {
    console.error('创建支付宝订单失败:', error);
    res.status(error.statusCode || 500).json({
      message: toPublicErrorMessage('创建支付订单失败') || error.message || '创建支付订单失败'
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
      message: toPublicErrorMessage('查询支付结果失败') || error.message || '查询支付结果失败'
    });
  }
};

const submitPaymentOrderApiUsername = async (req, res) => {
  try {
    const result = await paymentService.submitPaymentOrderApiUsername({
      userId: req.user.userId,
      orderNo: req.params.orderNo,
      apiUsername: req.body?.apiUsername
    });

    res.json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      message: toPublicErrorMessage('保存 DPCC-API 平台用户名失败') || error.message || '保存 DPCC-API 平台用户名失败'
    });
  }
};

const handleAlipayNotify = async (req, res) => {
  try {
    const result = await paymentService.handleAlipayNotify(req.body || {}, {
      clientIp: getClientIp(req)
    });
    if (result?.nonRetryable) {
      console.error('支付宝通知不可重试失败:', result.message || result);
    }
    res.type('text/plain').send('success');
  } catch (error) {
    console.error('处理支付宝异步通知失败:', error);
    if (error.nonRetryable || (error.statusCode && error.statusCode < 500)) {
      res.type('text/plain').send('success');
      return;
    }
    res.type('text/plain').send('fail');
  }
};

module.exports = {
  getPaymentCatalog,
  createAlipayOrder,
  getPaymentOrderResult,
  submitPaymentOrderApiUsername,
  handleAlipayNotify
};
