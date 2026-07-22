const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const adminGameController = require('../controllers/adminGameController');
const adminUserController = require('../controllers/adminUserController');
const adminRedeemCodeController = require('../controllers/adminRedeemCodeController');
const adminPaymentOrderController = require('../controllers/adminPaymentOrderController');
const adminPaymentProductController = require('../controllers/adminPaymentProductController');
const adminSecurityController = require('../controllers/adminSecurityController');
const contentController = require('../controllers/contentController');
const {
  authenticateToken,
  checkAdminPermission,
  requireSuperAdminPermission,
  requireCookieAuthForSensitiveAdminAction
} = require('../middleware/auth');
const {
  requireTrustedAdminMutation,
  requireAdminElevation,
  requireFreshAdminElevation,
  requireFreshAdminMutation
} = require('../middleware/adminSecurity');

const adminFactorLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '管理员二次验证尝试过于频繁，请稍后再试',
    code: 'ADMIN_FACTOR_RATE_LIMITED'
  },
  keyGenerator: (req) => `admin-factor:${req.user?.userId || req.ip}`
});

const adminSetupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: '管理员验证器配置尝试过于频繁，请稍后再试',
    code: 'ADMIN_SETUP_RATE_LIMITED'
  },
  keyGenerator: (req) => `admin-setup:${req.user?.userId || req.ip}`
});

const secretReadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 30,
  message: '读取兑换码过于频繁，请稍后再试',
  keyGenerator: (req) => (
    req.user?.userId ? `admin:${req.user.userId}` : req.ip || req.connection.remoteAddress
  )
});

const ensureDirSync = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const createContentUploader = (type) => {
  const destinationDir = type === 'blog-image'
    ? contentController.BLOG_UPLOAD_DIR
    : type === 'doc-file'
      ? contentController.DOC_FILE_UPLOAD_DIR
      : contentController.DOC_COVER_UPLOAD_DIR;

  ensureDirSync(destinationDir);

  return multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, destinationDir),
      filename: (req, file, cb) => {
        const ext = path.extname(file.originalname || '').toLowerCase();
        const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        cb(null, `${type}-${suffix}${ext}`);
      }
    }),
    limits: { fileSize: type === 'doc-file' ? 20 * 1024 * 1024 : 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const mime = String(file.mimetype || '').toLowerCase();

      if (type === 'doc-file') {
        if (ext === '.md' || mime === 'text/markdown' || mime === 'text/plain') return cb(null, true);
        return cb(new Error('仅支持上传 Markdown 文档'));
      }

      if (mime.startsWith('image/') && ['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
        return cb(null, true);
      }
      return cb(new Error('仅支持 WEBP/PNG/JPG/GIF 图片'));
    }
  });
};

const uploadBlogImage = createContentUploader('blog-image').single('image');
const uploadDocAssets = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = file.fieldname === 'file'
        ? contentController.DOC_FILE_UPLOAD_DIR
        : file.fieldname === 'contentImages'
          ? contentController.DOC_ASSET_UPLOAD_DIR
        : contentController.DOC_COVER_UPLOAD_DIR;
      ensureDirSync(dir);
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase();
      const prefix = file.fieldname === 'file'
        ? 'doc-file'
        : file.fieldname === 'contentImages'
          ? 'doc-asset'
          : 'doc-cover';
      const suffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
      cb(null, `${prefix}-${suffix}${ext}`);
    }
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const mime = String(file.mimetype || '').toLowerCase();

    if (file.fieldname === 'file') {
      if (ext === '.md' || mime === 'text/markdown' || mime === 'text/plain') return cb(null, true);
      return cb(new Error('仅支持上传 Markdown 文档'));
    }

    if (file.fieldname === 'contentImages' && mime.startsWith('image/') && ['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
      return cb(null, true);
    }

    if (file.fieldname === 'cover' && mime.startsWith('image/') && ['.webp', '.png', '.jpg', '.jpeg', '.gif'].includes(ext)) {
      return cb(null, true);
    }
    return cb(new Error('不支持的内容资源类型'));
  }
}).fields([
  { name: 'cover', maxCount: 1 },
  { name: 'file', maxCount: 1 },
  { name: 'contentImages', maxCount: 60 }
]);

const handleMulter = (uploader, sizeMessage) => (req, res, next) => {
  uploader(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: sizeMessage });
    }
    if (error) {
      return res.status(400).json({ error: error.message || '文件上传失败' });
    }
    next();
  });
};

router.use(authenticateToken, checkAdminPermission);

router.get('/check-permission', adminUserController.checkPermission);
router.get('/security/status', adminSecurityController.getStatus);
router.post('/security/setup', requireTrustedAdminMutation, adminSetupLimiter, adminSecurityController.beginSetup);
router.post('/security/setup/confirm', requireTrustedAdminMutation, adminFactorLimiter, adminSecurityController.finishSetup);
router.post('/security/verify', requireTrustedAdminMutation, adminFactorLimiter, adminSecurityController.verify);
router.post('/security/revoke', requireTrustedAdminMutation, adminSecurityController.revoke);

router.use(requireAdminElevation);
router.use(requireTrustedAdminMutation);
router.use(requireFreshAdminMutation);

router.post('/games/:gameId/review', adminGameController.reviewGame);
router.get('/games/pending', adminGameController.getPendingGames);
router.get('/games/all', adminGameController.getAllGames);
router.delete('/games/:gameId/delete', adminGameController.deleteGame);

router.get('/users', adminUserController.getUsers);
router.post('/users/:userId/role', requireSuperAdminPermission, adminUserController.updateUserRole);
router.post('/users/:userId/ban', adminUserController.toggleUserBan);
router.delete('/users/:userId/delete', adminUserController.deleteUser);

router.get('/redeem-codes/catalog', requireSuperAdminPermission, adminRedeemCodeController.getRedeemCodeCatalog);
router.get('/redeem-codes', requireSuperAdminPermission, adminRedeemCodeController.listRedeemCodes);
router.post('/redeem-codes/import', requireSuperAdminPermission, adminRedeemCodeController.importRedeemCodes);
router.post('/redeem-codes/batch-delete', requireSuperAdminPermission, adminRedeemCodeController.batchDeleteRedeemCodes);
router.get('/redeem-codes/:id/secret', requireSuperAdminPermission, requireFreshAdminElevation, requireCookieAuthForSensitiveAdminAction, secretReadLimiter, adminRedeemCodeController.getRedeemCodeSecret);
router.delete('/redeem-codes/:id', requireSuperAdminPermission, adminRedeemCodeController.deleteRedeemCode);

router.get('/payment-products', requireSuperAdminPermission, adminPaymentProductController.listProducts);
router.post('/payment-products', requireSuperAdminPermission, adminPaymentProductController.createProduct);
router.put('/payment-products/:id', requireSuperAdminPermission, adminPaymentProductController.updateProduct);
router.post('/payment-products/:id/copy', requireSuperAdminPermission, adminPaymentProductController.copyProduct);
router.post('/payment-products/:productId/promotions', requireSuperAdminPermission, adminPaymentProductController.createPromotion);
router.put('/payment-promotions/:id', requireSuperAdminPermission, adminPaymentProductController.updatePromotion);

router.get('/payment-orders', requireSuperAdminPermission, adminPaymentOrderController.listOrders);
router.get('/payment-orders/:orderNo', requireSuperAdminPermission, adminPaymentOrderController.getOrderDetail);
router.delete('/payment-orders/:orderNo', requireSuperAdminPermission, adminPaymentOrderController.deleteOrder);

router.get('/content/blog-posts', contentController.listAdminBlogPosts);
router.post('/content/blog-posts', handleMulter(uploadBlogImage, '图片文件大小超出限制（最大 8MB）'), contentController.createAdminBlogPost);
router.put('/content/blog-posts/:id', handleMulter(uploadBlogImage, '图片文件大小超出限制（最大 8MB）'), contentController.updateAdminBlogPost);
router.delete('/content/blog-posts/:id', contentController.deleteAdminBlogPost);
router.get('/content/docs', contentController.listAdminDocs);
router.post('/content/docs', handleMulter(uploadDocAssets, '内容资源大小超出限制（最大 20MB）'), contentController.createAdminDoc);
router.put('/content/docs/sort', contentController.reorderAdminDocs);
router.put('/content/docs/:id', handleMulter(uploadDocAssets, '内容资源大小超出限制（最大 20MB）'), contentController.updateAdminDoc);
router.delete('/content/docs/:id', contentController.deleteAdminDoc);

module.exports = router;
