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
const contentController = require('../controllers/contentController');
const {
  authenticateToken,
  checkAdminPermission,
  requireSuperAdminPermission,
  requireCookieAuthForSensitiveAdminAction
} = require('../middleware/auth');

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
router.get('/redeem-codes/:id/secret', authenticateToken, checkAdminPermission, requireSuperAdminPermission, requireCookieAuthForSensitiveAdminAction, secretReadLimiter, adminRedeemCodeController.getRedeemCodeSecret);
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

router.get('/content/blog-posts', authenticateToken, checkAdminPermission, contentController.listAdminBlogPosts);
router.post('/content/blog-posts', authenticateToken, checkAdminPermission, handleMulter(uploadBlogImage, '图片文件大小超出限制（最大 8MB）'), contentController.createAdminBlogPost);
router.put('/content/blog-posts/:id', authenticateToken, checkAdminPermission, handleMulter(uploadBlogImage, '图片文件大小超出限制（最大 8MB）'), contentController.updateAdminBlogPost);
router.delete('/content/blog-posts/:id', authenticateToken, checkAdminPermission, contentController.deleteAdminBlogPost);
router.get('/content/docs', authenticateToken, checkAdminPermission, contentController.listAdminDocs);
router.post('/content/docs', authenticateToken, checkAdminPermission, handleMulter(uploadDocAssets, '内容资源大小超出限制（最大 20MB）'), contentController.createAdminDoc);
router.put('/content/docs/sort', authenticateToken, checkAdminPermission, contentController.reorderAdminDocs);
router.put('/content/docs/:id', authenticateToken, checkAdminPermission, handleMulter(uploadDocAssets, '内容资源大小超出限制（最大 20MB）'), contentController.updateAdminDoc);
router.delete('/content/docs/:id', authenticateToken, checkAdminPermission, contentController.deleteAdminDoc);

module.exports = router;
