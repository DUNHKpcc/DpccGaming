const express = require('express');
const router = express.Router();

const adminGameController = require('../controllers/adminGameController');
const adminUserController = require('../controllers/adminUserController');
const adminRedeemCodeController = require('../controllers/adminRedeemCodeController');
const adminPaymentOrderController = require('../controllers/adminPaymentOrderController');
const adminPaymentProductController = require('../controllers/adminPaymentProductController');
const { authenticateToken, checkAdminPermission, requireSuperAdminPermission } = require('../middleware/auth');

router.post('/games/:gameId/review', authenticateToken, checkAdminPermission, adminGameController.reviewGame);
router.get('/games/pending', authenticateToken, checkAdminPermission, adminGameController.getPendingGames);
router.get('/games/all', authenticateToken, checkAdminPermission, adminGameController.getAllGames);
router.delete('/games/:gameId/delete', authenticateToken, checkAdminPermission, adminGameController.deleteGame);

router.get('/check-permission', authenticateToken, checkAdminPermission, adminUserController.checkPermission);
router.get('/users', authenticateToken, checkAdminPermission, adminUserController.getUsers);
router.post('/users/:userId/role', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminUserController.updateUserRole);
router.post('/users/:userId/ban', authenticateToken, checkAdminPermission, adminUserController.toggleUserBan);
router.delete('/users/:userId/delete', authenticateToken, checkAdminPermission, adminUserController.deleteUser);

router.get('/redeem-codes/catalog', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminRedeemCodeController.getRedeemCodeCatalog);
router.get('/redeem-codes', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminRedeemCodeController.listRedeemCodes);
router.post('/redeem-codes/import', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminRedeemCodeController.importRedeemCodes);
router.post('/redeem-codes/batch-delete', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminRedeemCodeController.batchDeleteRedeemCodes);
router.get('/redeem-codes/:id/secret', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminRedeemCodeController.getRedeemCodeSecret);
router.delete('/redeem-codes/:id', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminRedeemCodeController.deleteRedeemCode);

router.get('/payment-products', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.listProducts);
router.post('/payment-products', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.createProduct);
router.put('/payment-products/:id', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.updateProduct);
router.post('/payment-products/:id/copy', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.copyProduct);
router.post('/payment-products/:productId/promotions', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.createPromotion);
router.put('/payment-promotions/:id', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.updatePromotion);

router.get('/payment-orders', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentOrderController.listOrders);
router.get('/payment-orders/:orderNo', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentOrderController.getOrderDetail);
router.delete('/payment-orders/:orderNo', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentOrderController.deleteOrder);

module.exports = router;
