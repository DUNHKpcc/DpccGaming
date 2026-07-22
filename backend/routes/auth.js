const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const authController = require('../controllers/authController');
const { authenticateToken, optionalAuthenticateToken } = require('../middleware/auth');
const { clearAdminElevationOnLogout } = require('../middleware/adminSecurity');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '登录尝试过于频繁，请稍后再试' },
  keyGenerator: (req) => {
    const username = String(req.body?.username || '').trim().toLowerCase().slice(0, 128);
    return `login:${req.ip}:${username}`;
  }
});

const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsRoot = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
    const avatarDir = path.join(uploadsRoot, 'avatars');
    fs.mkdirSync(avatarDir, { recursive: true });
    cb(null, avatarDir);
  },
  filename: function (req, file, cb) {
    const safeUserId = req.user?.userId || 'user';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `avatar-${safeUserId}-${uniqueSuffix}${path.extname(file.originalname || '')}`);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('只允许上传图片文件'), false);
  }
});

const coverStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadsRoot = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
    const coverDir = path.join(uploadsRoot, 'covers');
    fs.mkdirSync(coverDir, { recursive: true });
    cb(null, coverDir);
  },
  filename: function (req, file, cb) {
    const safeUserId = req.user?.userId || 'user';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `cover-${safeUserId}-${uniqueSuffix}${path.extname(file.originalname || '')}`);
  }
});

const uploadCover = multer({
  storage: coverStorage,
  limits: {
    fileSize: 12 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    const mime = (file.mimetype || '').toLowerCase();
    if (mime.startsWith('image/')) {
      return cb(null, true);
    }
    return cb(new Error('只允许上传图片文件'), false);
  }
});

router.post('/register', authController.register);
router.post('/login', loginLimiter, authController.login);
router.post('/logout', optionalAuthenticateToken, clearAdminElevationOnLogout, authController.logout);
router.get('/auth/wechat/start', authController.startWechatLogin);
router.get('/auth/wechat/bind/start', authenticateToken, authController.startWechatBind);
router.get('/auth/wechat/bind-status', authenticateToken, authController.getWechatBindStatus);
router.get('/auth/wechat/callback', authController.handleWechatCallback);
router.get('/auth/google/start', authController.startGoogleLogin);
router.get('/auth/google/bind/start', authenticateToken, authController.startGoogleBind);
router.get('/auth/google/bind-status', authenticateToken, authController.getGoogleBindStatus);
router.get('/auth/google/callback', authController.handleGoogleCallback);
router.post(
  '/user/avatar',
  authenticateToken,
  (req, res, next) => {
    uploadAvatar.single('avatar')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || '头像上传失败' });
      }
      next();
    });
  },
  authController.updateAvatar
);
router.post(
  '/user/cover',
  authenticateToken,
  (req, res, next) => {
    uploadCover.single('cover')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || '封面上传失败' });
      }
      next();
    });
  },
  authController.updateCover
);
router.patch('/user/profile', authenticateToken, authController.updateUserProfile);

router.get('/verify-token', authenticateToken, authController.verifyTokenEndpoint);
router.get('/user/profile', authenticateToken, authController.getUserProfile);

router.get('/auth/me', authenticateToken, authController.getCurrentUser);
router.get('/me', authenticateToken, authController.getCurrentUser);

module.exports = router;
