const appConfig = require('../config/app');
const { parseCookies } = require('./auth');
const {
  getSecurityStatus,
  revokeElevationSession
} = require('../services/adminSecurityService');

const securityConfig = appConfig.adminSecurity;
const cookieOptions = {
  httpOnly: true,
  secure: appConfig.server.nodeEnv === 'production',
  sameSite: 'strict',
  path: '/api'
};
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

const getAdminElevationToken = (req) => {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[securityConfig.cookieName] || '';
};

const setAdminElevationCookie = (res, token) => {
  res.cookie(securityConfig.cookieName, token, {
    ...cookieOptions,
    maxAge: securityConfig.absoluteHours * 60 * 60 * 1000
  });
};

const clearAdminElevationCookie = (res) => {
  res.clearCookie(securityConfig.cookieName, cookieOptions);
};

const normalizeOrigin = (value) => {
  try {
    return new URL(String(value || '')).origin;
  } catch (error) {
    return '';
  }
};

const requireTrustedAdminMutation = (req, res, next) => {
  if (safeMethods.has(req.method)) return next();

  if (String(req.headers['x-dpcc-admin-request'] || '') !== '1') {
    return res.status(403).json({
      error: '管理员操作请求无效',
      code: 'ADMIN_REQUEST_HEADER_REQUIRED'
    });
  }

  const fetchSite = String(req.headers['sec-fetch-site'] || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return res.status(403).json({
      error: '不允许跨站执行管理员操作',
      code: 'ADMIN_CROSS_SITE_REQUEST_REJECTED'
    });
  }

  const origin = normalizeOrigin(req.headers.origin);
  const allowedOrigins = appConfig.cors.origins.map(normalizeOrigin).filter(Boolean);
  const requestOrigin = normalizeOrigin(`${req.protocol}://${req.headers.host || ''}`);
  const sameOrigin = Boolean(origin && requestOrigin && origin === requestOrigin);

  if (!origin || (!sameOrigin && !allowedOrigins.includes(origin))) {
    return res.status(403).json({
      error: '管理员操作来源无效',
      code: 'ADMIN_ORIGIN_REJECTED'
    });
  }

  next();
};

const requireAdminElevation = async (req, res, next) => {
  try {
    const token = getAdminElevationToken(req);
    const status = await getSecurityStatus(req.user.userId, token, true);
    req.adminSecurity = status;

    if (!status.enrolled) {
      return res.status(428).json({
        error: '需要先配置管理员验证器',
        code: 'ADMIN_TOTP_ENROLLMENT_REQUIRED'
      });
    }

    if (!status.elevated) {
      if (token) clearAdminElevationCookie(res);
      return res.status(428).json({
        error: '需要管理员二次验证',
        code: 'ADMIN_ELEVATION_REQUIRED'
      });
    }

    next();
  } catch (error) {
    console.error('管理员提权会话检查失败:', error);
    res.status(500).json({ error: '管理员安全状态检查失败' });
  }
};

const requireFreshAdminElevation = (req, res, next) => {
  const freshUntil = req.adminSecurity?.freshUntil
    ? new Date(req.adminSecurity.freshUntil).getTime()
    : 0;
  if (freshUntil <= Date.now()) {
    return res.status(428).json({
      error: '该操作需要重新验证管理员身份',
      code: 'ADMIN_REAUTH_REQUIRED'
    });
  }
  next();
};

const requireFreshAdminMutation = (req, res, next) => {
  if (safeMethods.has(req.method)) return next();
  return requireFreshAdminElevation(req, res, next);
};

const clearAdminElevationOnLogout = async (req, res, next) => {
  const token = getAdminElevationToken(req);
  clearAdminElevationCookie(res);

  if (token && req.user?.userId) {
    try {
      await revokeElevationSession(req.user.userId, token);
    } catch (error) {
      console.error('退出登录时撤销管理员安全会话失败:', error);
    }
  }
  next();
};

module.exports = {
  getAdminElevationToken,
  setAdminElevationCookie,
  clearAdminElevationCookie,
  requireTrustedAdminMutation,
  requireAdminElevation,
  requireFreshAdminElevation,
  requireFreshAdminMutation,
  clearAdminElevationOnLogout
};
