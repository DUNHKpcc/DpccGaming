const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');

const router = express.Router();

router.get('/catalog', optionalAuthenticateToken, paymentController.getPaymentCatalog);
router.get('/orders/:orderNo', authenticateToken, paymentController.getPaymentOrderResult);
router.post('/orders/:orderNo/api-username', authenticateToken, paymentController.submitPaymentOrderApiUsername);
router.post('/alipay/orders', authenticateToken, paymentController.createAlipayOrder);
router.post('/alipay/notify', paymentController.handleAlipayNotify);

module.exports = router;
