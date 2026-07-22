const QRCode = require('qrcode');
const { getPool } = require('../config/database');
const appConfig = require('../config/app');
const { recordAdminAuditLog } = require('../utils/adminAudit');
const {
  AdminSecurityError,
  startEnrollment,
  confirmEnrollment,
  verifyFactor,
  getSecurityStatus,
  revokeElevationSession
} = require('../services/adminSecurityService');
const {
  getAdminElevationToken,
  setAdminElevationCookie,
  clearAdminElevationCookie
} = require('../middleware/adminSecurity');

const requestMeta = (req) => ({
  ipAddress: req.ip || req.connection?.remoteAddress || '',
  userAgent: req.headers['user-agent'] || ''
});

const audit = async (req, action, metadata = {}) => {
  try {
    await recordAdminAuditLog(getPool(), {
      adminUserId: req.user?.userId,
      action,
      resourceType: 'admin_security',
      resourceId: req.user?.userId,
      metadata,
      ...requestMeta(req)
    });
  } catch (error) {
    console.error('记录管理员安全审计日志失败:', error);
  }
};

const sendError = async (req, res, action, error) => {
  const status = error instanceof AdminSecurityError ? error.status : 500;
  const code = error instanceof AdminSecurityError
    ? error.code
    : 'ADMIN_SECURITY_INTERNAL_ERROR';
  if (!(error instanceof AdminSecurityError)) {
    console.error('管理员安全操作失败:', error);
  }
  await audit(req, `${action}.failed`, { code });

  return res.status(status).json({
    error: error instanceof AdminSecurityError ? error.message : '管理员安全操作失败',
    code,
    ...(error.lockedUntil && { lockedUntil: error.lockedUntil })
  });
};

const getStatus = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const token = getAdminElevationToken(req);
    const status = await getSecurityStatus(req.user.userId, token, true);
    if (token && !status.elevated) clearAdminElevationCookie(res);
    res.json(status);
  } catch (error) {
    return sendError(req, res, 'admin_security.status', error);
  }
};

const beginSetup = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const password = String(req.body?.password || '');
  if (!password || password.length > 256) {
    return res.status(400).json({
      error: '请输入当前账号密码',
      code: 'ADMIN_PASSWORD_REQUIRED'
    });
  }

  try {
    const enrollment = await startEnrollment(req.user.userId, password);
    const qrCodeDataUrl = await QRCode.toDataURL(enrollment.uri, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240
    });
    await audit(req, 'admin_security.setup.started');
    res.json({
      secret: enrollment.secret,
      qrCodeDataUrl,
      expiresInMinutes: appConfig.adminSecurity.setupTtlMinutes
    });
  } catch (error) {
    return sendError(req, res, 'admin_security.setup', error);
  }
};

const finishSetup = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const code = String(req.body?.code || '');
  if (!code || code.length > 64) {
    return res.status(400).json({
      error: '请输入验证器中的 6 位验证码',
      code: 'ADMIN_FACTOR_REQUIRED'
    });
  }

  try {
    const result = await confirmEnrollment(
      req.user.userId,
      code,
      requestMeta(req)
    );
    setAdminElevationCookie(res, result.token);
    await audit(req, 'admin_security.setup.completed');
    res.json({
      elevated: true,
      expiresAt: result.absoluteExpiresAt,
      recoveryCodes: result.recoveryCodes
    });
  } catch (error) {
    return sendError(req, res, 'admin_security.setup.confirm', error);
  }
};

const verify = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const code = String(req.body?.code || '');
  if (!code || code.length > 64) {
    return res.status(400).json({
      error: '请输入验证码或恢复码',
      code: 'ADMIN_FACTOR_REQUIRED'
    });
  }

  try {
    const result = await verifyFactor(
      req.user.userId,
      code,
      requestMeta(req),
      getAdminElevationToken(req)
    );
    setAdminElevationCookie(res, result.token);
    await audit(req, 'admin_security.elevation.verified', {
      usedRecoveryCode: result.usedRecoveryCode
    });
    res.json({
      elevated: true,
      expiresAt: result.absoluteExpiresAt,
      usedRecoveryCode: result.usedRecoveryCode
    });
  } catch (error) {
    return sendError(req, res, 'admin_security.elevation', error);
  }
};

const revoke = async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const token = getAdminElevationToken(req);
    await revokeElevationSession(req.user.userId, token);
    clearAdminElevationCookie(res);
    await audit(req, 'admin_security.elevation.revoked');
    res.json({ success: true });
  } catch (error) {
    return sendError(req, res, 'admin_security.revoke', error);
  }
};

module.exports = {
  getStatus,
  beginSetup,
  finishSetup,
  verify,
  revoke
};
