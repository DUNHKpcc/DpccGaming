const express = require('express');
const router = express.Router();

const adminGameController = require('../controllers/adminGameController');
const adminUserController = require('../controllers/adminUserController');
const adminRedeemCodeController = require('../controllers/adminRedeemCodeController');
const { authenticateToken, checkAdminPermission } = require('../middleware/auth');

router.post('/games/:gameId/review', authenticateToken, checkAdminPermission, adminGameController.reviewGame);
router.get('/games/pending', authenticateToken, checkAdminPermission, adminGameController.getPendingGames);
router.get('/games/all', authenticateToken, checkAdminPermission, adminGameController.getAllGames);
router.delete('/games/:gameId/delete', authenticateToken, checkAdminPermission, adminGameController.deleteGame);

router.get('/check-permission', authenticateToken, checkAdminPermission, adminUserController.checkPermission);
router.get('/users', authenticateToken, checkAdminPermission, adminUserController.getUsers);
router.post('/users/:userId/role', authenticateToken, checkAdminPermission, adminUserController.updateUserRole);
router.post('/users/:userId/ban', authenticateToken, checkAdminPermission, adminUserController.toggleUserBan);
router.delete('/users/:userId/delete', authenticateToken, checkAdminPermission, adminUserController.deleteUser);

router.get('/redeem-codes/catalog', authenticateToken, checkAdminPermission, adminRedeemCodeController.getRedeemCodeCatalog);
router.get('/redeem-codes', authenticateToken, checkAdminPermission, adminRedeemCodeController.listRedeemCodes);
router.post('/redeem-codes/import', authenticateToken, checkAdminPermission, adminRedeemCodeController.importRedeemCodes);

module.exports = router;
