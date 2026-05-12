const express = require('express');
const rateLimit = require('express-rate-limit');
const paymentController = require('../controllers/paymentController');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');

const router = express.Router();

const createOrderLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  message: '创建订单过于频繁，请稍后再试',
  keyGenerator: (req) => (
    req.user?.userId ? `user:${req.user.userId}` : req.ip || req.connection.remoteAddress
  )
});

router.get('/catalog', optionalAuthenticateToken, paymentController.getPaymentCatalog);
router.get('/orders/:orderNo', authenticateToken, paymentController.getPaymentOrderResult);
router.post('/orders/:orderNo/api-username', authenticateToken, paymentController.submitPaymentOrderApiUsername);
router.post('/alipay/orders', authenticateToken, createOrderLimiter, paymentController.createAlipayOrder);
router.post('/alipay/notify', paymentController.handleAlipayNotify);

module.exports = router;
