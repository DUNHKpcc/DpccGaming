const jwt = require('jsonwebtoken');
const { getPool } = require('../config/database');
const appConfig = require('../config/app');

const JWT_SECRET = appConfig.jwt.secret;
const AUTH_COOKIE_NAME = appConfig.jwt.cookieName || 'dpcc_auth_token';

function parseCookies(cookieHeader = '') {
  if (!cookieHeader) return {};
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      if (!key) return acc;
      try {
        acc[key] = decodeURIComponent(value);
      } catch (error) {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.split(' ')[1];
    if (bearerToken) return bearerToken;
  }

  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[AUTH_COOKIE_NAME] || null;
}

function authenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      error: '访问令牌缺失',
      message: '请先登录后再进行操作'
    });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT验证失败:', err.message);
      return res.status(403).json({
        error: '无效的访问令牌',
        message: '登录已过期，请重新登录'
      });
    }
    req.user = user;
    next();
  });
}

function optionalAuthenticateToken(req, res, next) {
  const token = extractToken(req);

  if (!token) {
    next();
    return;
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (!err && user) {
      req.user = user;
    }
    next();
  });
}

async function checkAdminPermission(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: '未认证',
      message: '请先登录'
    });
  }

  try {
    const pool = getPool();
    const [users] = await pool.execute(
      'SELECT role, status FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (users.length === 0) {
      return res.status(403).json({
        error: '用户不存在',
        message: '用户信息无效'
      });
    }

    const user = users[0];

    if (user.status !== 'active') {
      return res.status(403).json({
        error: '账户已禁用',
        message: '您的账户已被禁用，无法访问管理功能'
      });
    }

    if (!['admin', 'super_admin'].includes(user.role)) {
      return res.status(403).json({
        error: '权限不足',
        message: '只有管理员才能访问此功能'
      });
    }

    req.user.role = user.role;
    req.user.status = user.status;
    next();
  } catch (error) {
    console.error('权限检查错误:', error);
    res.status(500).json({ error: '权限检查失败' });
  }
}

function requireSuperAdminPermission(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: '未认证',
      message: '请先登录'
    });
  }

  if (req.user.role !== 'super_admin') {
    return res.status(403).json({
      error: '权限不足',
      message: '只有超级管理员才能访问此功能'
    });
  }

  next();
}

function generateToken(user) {
  return jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: appConfig.jwt.expiresIn || '30d' }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('令牌验证失败');
  }
}

function errorHandler(err, req, res, next) {
  console.error('服务器错误:', err.stack || err.message);

  let status = err.status || 500;
  let message = err.message || '服务器内部错误';

  if (err.name === 'ValidationError') {
    status = 400;
    message = '请求数据验证失败';
  } else if (err.name === 'UnauthorizedError') {
    status = 401;
    message = '未授权访问';
  } else if (err.name === 'ForbiddenError') {
    status = 403;
    message = '访问被禁止';
  } else if (err.name === 'NotFoundError') {
    status = 404;
    message = '请求的资源未找到';
  }

  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(status).json({
    error: message,
    ...(isDevelopment && { stack: err.stack })
  });
}

module.exports = {
  authenticateToken,
  optionalAuthenticateToken,
  checkAdminPermission,
  requireSuperAdminPermission,
  generateToken,
  verifyToken,
  extractToken,
  errorHandler
};
