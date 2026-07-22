const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const OTPAuth = require('otpauth');
const { getPool } = require('../config/database');
const appConfig = require('../config/app');

const securityConfig = appConfig.adminSecurity;
const encryptionKey = crypto
  .createHash('sha256')
  .update(securityConfig.encryptionKey, 'utf8')
  .digest();

let tablesInitPromise = null;

class AdminSecurityError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AdminSecurityError';
    this.status = status;
    this.code = code;
  }
}

const ensureAdminSecurityTables = async (executor = getPool()) => {
  if (!tablesInitPromise) {
    tablesInitPromise = (async () => {
      await executor.execute(`
        CREATE TABLE IF NOT EXISTS admin_security_credentials (
          user_id INT NOT NULL,
          totp_secret_ciphertext TEXT DEFAULT NULL,
          totp_secret_iv VARCHAR(32) DEFAULT NULL,
          totp_secret_auth_tag VARCHAR(32) DEFAULT NULL,
          pending_secret_ciphertext TEXT DEFAULT NULL,
          pending_secret_iv VARCHAR(32) DEFAULT NULL,
          pending_secret_auth_tag VARCHAR(32) DEFAULT NULL,
          pending_started_at DATETIME DEFAULT NULL,
          recovery_code_hashes TEXT DEFAULT NULL,
          totp_enabled_at DATETIME DEFAULT NULL,
          last_totp_counter BIGINT UNSIGNED DEFAULT NULL,
          failed_attempts SMALLINT UNSIGNED NOT NULL DEFAULT 0,
          locked_until DATETIME DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (user_id),
          CONSTRAINT fk_admin_security_credentials_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);

      await executor.execute(`
        CREATE TABLE IF NOT EXISTS admin_elevation_sessions (
          id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
          verified_at DATETIME NOT NULL,
          last_seen_at DATETIME NOT NULL,
          absolute_expires_at DATETIME NOT NULL,
          revoked_at DATETIME DEFAULT NULL,
          ip_address VARCHAR(64) DEFAULT NULL,
          user_agent VARCHAR(255) DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_admin_elevation_token_hash (token_hash),
          INDEX idx_admin_elevation_user_active (user_id, revoked_at, absolute_expires_at),
          CONSTRAINT fk_admin_elevation_sessions_user
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    })().catch((error) => {
      tablesInitPromise = null;
      throw error;
    });
  }

  await tablesInitPromise;
};

const encryptSecret = (secret) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const ciphertext = Buffer.concat([
    cipher.update(String(secret), 'utf8'),
    cipher.final()
  ]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  };
};

const decryptSecret = ({ ciphertext, iv, authTag }) => {
  if (!ciphertext || !iv || !authTag) {
    throw new AdminSecurityError(409, 'ADMIN_TOTP_NOT_READY', '管理员验证器尚未配置');
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey,
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

const createTotp = (secret, username = '') => new OTPAuth.TOTP({
  issuer: securityConfig.issuer,
  label: username || 'admin',
  algorithm: 'SHA1',
  digits: 6,
  period: 30,
  secret: OTPAuth.Secret.fromBase32(secret)
});

const normalizeTotpCode = (value) => String(value || '').replace(/\s+/g, '');
const normalizeRecoveryCode = (value) => String(value || '')
  .toUpperCase()
  .replace(/[^A-Z0-9]/g, '');

const hashRecoveryCode = (userId, code) => crypto
  .createHmac('sha256', encryptionKey)
  .update(`${userId}:${normalizeRecoveryCode(code)}`, 'utf8')
  .digest('hex');

const generateRecoveryCodes = (userId, count = 8) => {
  const codes = Array.from({ length: count }, () => {
    const raw = crypto.randomBytes(6).toString('hex').toUpperCase();
    return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
  });

  return {
    codes,
    hashes: codes.map((code) => hashRecoveryCode(userId, code))
  };
};

const hashSessionToken = (token) => crypto
  .createHash('sha256')
  .update(String(token || ''), 'utf8')
  .digest('hex');

const getClientMetadata = (requestMeta = {}) => ({
  ipAddress: String(requestMeta.ipAddress || '').slice(0, 64) || null,
  userAgent: String(requestMeta.userAgent || '').slice(0, 255) || null
});

const createElevationSession = async (executor, userId, requestMeta = {}) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const absoluteExpiresAt = new Date(
    now.getTime() + securityConfig.absoluteHours * 60 * 60 * 1000
  );
  const { ipAddress, userAgent } = getClientMetadata(requestMeta);

  await executor.execute(
    `
      INSERT INTO admin_elevation_sessions
        (user_id, token_hash, verified_at, last_seen_at, absolute_expires_at, ip_address, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [userId, tokenHash, now, now, absoluteExpiresAt, ipAddress, userAgent]
  );

  return { token, verifiedAt: now, absoluteExpiresAt };
};

const getCredentialForUpdate = async (connection, userId) => {
  const [rows] = await connection.execute(
    'SELECT * FROM admin_security_credentials WHERE user_id = ? FOR UPDATE',
    [userId]
  );
  return rows[0] || null;
};

const throwIfLocked = (credential) => {
  const lockedUntil = credential?.locked_until
    ? new Date(credential.locked_until)
    : null;

  if (lockedUntil && lockedUntil.getTime() > Date.now()) {
    const error = new AdminSecurityError(
      429,
      'ADMIN_FACTOR_LOCKED',
      '验证失败次数过多，请稍后再试'
    );
    error.lockedUntil = lockedUntil;
    throw error;
  }
};

const registerFailedAttempt = async (connection, credential) => {
  const now = Date.now();
  const previousLock = credential.locked_until
    ? new Date(credential.locked_until).getTime()
    : 0;
  const baseAttempts = previousLock > 0 && previousLock <= now
    ? 0
    : Number(credential.failed_attempts || 0);
  const failedAttempts = baseAttempts + 1;
  const shouldLock = failedAttempts >= securityConfig.maxFailedAttempts;
  const lockedUntil = shouldLock
    ? new Date(now + securityConfig.lockoutMinutes * 60 * 1000)
    : null;

  await connection.execute(
    `
      UPDATE admin_security_credentials
      SET failed_attempts = ?, locked_until = ?
      WHERE user_id = ?
    `,
    [shouldLock ? 0 : failedAttempts, lockedUntil, credential.user_id]
  );

  return lockedUntil;
};

const invalidFactorError = (lockedUntil = null) => {
  if (lockedUntil) {
    const error = new AdminSecurityError(
      429,
      'ADMIN_FACTOR_LOCKED',
      '验证失败次数过多，请稍后再试'
    );
    error.lockedUntil = lockedUntil;
    return error;
  }

  return new AdminSecurityError(
    400,
    'ADMIN_FACTOR_INVALID',
    '验证码或恢复码无效'
  );
};

const verifyTotp = (credential, secret, code, username = '') => {
  const normalized = normalizeTotpCode(code);
  if (!/^\d{6}$/.test(normalized)) return null;

  const totp = createTotp(secret, username);
  const delta = totp.validate({ token: normalized, window: 1 });
  if (delta === null) return null;

  const counter = totp.counter() + delta;
  const lastCounter = credential.last_totp_counter === null
    ? null
    : Number(credential.last_totp_counter);
  if (lastCounter !== null && counter <= lastCounter) return null;

  return counter;
};

const startEnrollment = async (userId, password) => {
  const pool = getPool();
  await ensureAdminSecurityTables(pool);

  const [users] = await pool.execute(
    'SELECT username, password_hash FROM users WHERE id = ?',
    [userId]
  );
  const user = users[0];
  const passwordHash = String(user?.password_hash || '');
  const hasLocalPassword = /^\$2[aby]\$/.test(passwordHash);
  if (!user || !hasLocalPassword) {
    throw new AdminSecurityError(
      409,
      'ADMIN_LOCAL_PASSWORD_REQUIRED',
      '该管理员账号没有可验证的本地密码，暂时无法启用验证器'
    );
  }

  const passwordValid = await bcrypt.compare(String(password || ''), passwordHash);
  if (!passwordValid) {
    throw new AdminSecurityError(403, 'ADMIN_PASSWORD_INVALID', '当前密码不正确');
  }

  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  const encrypted = encryptSecret(secret);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const credential = await getCredentialForUpdate(connection, userId);
    if (credential?.totp_enabled_at) {
      throw new AdminSecurityError(409, 'ADMIN_TOTP_ALREADY_ENABLED', '管理员验证器已经启用');
    }

    if (credential) {
      await connection.execute(
        `
          UPDATE admin_security_credentials
          SET pending_secret_ciphertext = ?, pending_secret_iv = ?,
              pending_secret_auth_tag = ?, pending_started_at = NOW(),
              failed_attempts = 0, locked_until = NULL
          WHERE user_id = ?
        `,
        [encrypted.ciphertext, encrypted.iv, encrypted.authTag, userId]
      );
    } else {
      await connection.execute(
        `
          INSERT INTO admin_security_credentials
            (user_id, pending_secret_ciphertext, pending_secret_iv,
             pending_secret_auth_tag, pending_started_at)
          VALUES (?, ?, ?, ?, NOW())
        `,
        [userId, encrypted.ciphertext, encrypted.iv, encrypted.authTag]
      );
    }

    await connection.commit();
    return {
      secret,
      username: user.username,
      uri: createTotp(secret, user.username).toString()
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const confirmEnrollment = async (userId, code, requestMeta = {}) => {
  const pool = getPool();
  await ensureAdminSecurityTables(pool);
  const connection = await pool.getConnection();
  let committed = false;

  try {
    await connection.beginTransaction();
    const credential = await getCredentialForUpdate(connection, userId);
    if (!credential?.pending_started_at) {
      throw new AdminSecurityError(409, 'ADMIN_TOTP_SETUP_MISSING', '请先使用当前密码开始配置验证器');
    }
    if (credential.totp_enabled_at) {
      throw new AdminSecurityError(409, 'ADMIN_TOTP_ALREADY_ENABLED', '管理员验证器已经启用');
    }

    throwIfLocked(credential);
    const pendingStartedAt = new Date(credential.pending_started_at).getTime();
    const setupExpiresAt = pendingStartedAt + securityConfig.setupTtlMinutes * 60 * 1000;
    if (!Number.isFinite(pendingStartedAt) || setupExpiresAt <= Date.now()) {
      throw new AdminSecurityError(410, 'ADMIN_TOTP_SETUP_EXPIRED', '配置已过期，请重新验证当前密码');
    }

    const secret = decryptSecret({
      ciphertext: credential.pending_secret_ciphertext,
      iv: credential.pending_secret_iv,
      authTag: credential.pending_secret_auth_tag
    });
    const counter = verifyTotp(credential, secret, code);
    if (counter === null) {
      const lockedUntil = await registerFailedAttempt(connection, credential);
      await connection.commit();
      committed = true;
      throw invalidFactorError(lockedUntil);
    }

    const recovery = generateRecoveryCodes(userId);
    const encrypted = encryptSecret(secret);
    await connection.execute(
      `
        UPDATE admin_security_credentials
        SET totp_secret_ciphertext = ?, totp_secret_iv = ?, totp_secret_auth_tag = ?,
            pending_secret_ciphertext = NULL, pending_secret_iv = NULL,
            pending_secret_auth_tag = NULL, pending_started_at = NULL,
            recovery_code_hashes = ?, totp_enabled_at = NOW(),
            last_totp_counter = ?, failed_attempts = 0, locked_until = NULL
        WHERE user_id = ?
      `,
      [
        encrypted.ciphertext,
        encrypted.iv,
        encrypted.authTag,
        JSON.stringify(recovery.hashes),
        counter,
        userId
      ]
    );
    await connection.execute(
      'UPDATE admin_elevation_sessions SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL',
      [userId]
    );
    const session = await createElevationSession(connection, userId, requestMeta);

    await connection.commit();
    committed = true;
    return { ...session, recoveryCodes: recovery.codes };
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const verifyFactor = async (userId, code, requestMeta = {}, currentSessionToken = '') => {
  const pool = getPool();
  await ensureAdminSecurityTables(pool);
  const connection = await pool.getConnection();
  let committed = false;

  try {
    await connection.beginTransaction();
    const credential = await getCredentialForUpdate(connection, userId);
    if (!credential?.totp_enabled_at) {
      throw new AdminSecurityError(409, 'ADMIN_TOTP_NOT_ENABLED', '请先配置管理员验证器');
    }
    throwIfLocked(credential);

    const secret = decryptSecret({
      ciphertext: credential.totp_secret_ciphertext,
      iv: credential.totp_secret_iv,
      authTag: credential.totp_secret_auth_tag
    });
    const totpCounter = verifyTotp(credential, secret, code);
    let recoveryHashes = [];
    try {
      recoveryHashes = JSON.parse(credential.recovery_code_hashes || '[]');
    } catch (error) {
      recoveryHashes = [];
    }

    let recoveryIndex = -1;
    if (totpCounter === null) {
      const candidateHash = hashRecoveryCode(userId, code);
      recoveryIndex = recoveryHashes.findIndex((storedHash) => {
        const stored = Buffer.from(String(storedHash || ''), 'hex');
        const candidate = Buffer.from(candidateHash, 'hex');
        return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
      });
    }

    if (totpCounter === null && recoveryIndex < 0) {
      const lockedUntil = await registerFailedAttempt(connection, credential);
      await connection.commit();
      committed = true;
      throw invalidFactorError(lockedUntil);
    }

    if (recoveryIndex >= 0) recoveryHashes.splice(recoveryIndex, 1);
    await connection.execute(
      `
        UPDATE admin_security_credentials
        SET last_totp_counter = ?, recovery_code_hashes = ?,
            failed_attempts = 0, locked_until = NULL
        WHERE user_id = ?
      `,
      [
        totpCounter === null ? credential.last_totp_counter : totpCounter,
        JSON.stringify(recoveryHashes),
        userId
      ]
    );
    if (currentSessionToken) {
      await connection.execute(
        `
          UPDATE admin_elevation_sessions
          SET revoked_at = NOW()
          WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL
        `,
        [userId, hashSessionToken(currentSessionToken)]
      );
    }
    const session = await createElevationSession(connection, userId, requestMeta);

    await connection.commit();
    committed = true;
    return { ...session, usedRecoveryCode: recoveryIndex >= 0 };
  } catch (error) {
    if (!committed) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const getSecurityStatus = async (userId, sessionToken = '', touch = false) => {
  const pool = getPool();
  await ensureAdminSecurityTables(pool);
  const [credentials] = await pool.execute(
    `
      SELECT totp_enabled_at, pending_started_at, locked_until
      FROM admin_security_credentials
      WHERE user_id = ?
    `,
    [userId]
  );
  const credential = credentials[0] || null;
  const status = {
    enrolled: Boolean(credential?.totp_enabled_at),
    setupPending: Boolean(credential?.pending_started_at),
    elevated: false,
    expiresAt: null,
    freshUntil: null,
    lockedUntil: credential?.locked_until || null
  };

  if (!sessionToken) return status;

  const now = new Date();
  const idleCutoff = new Date(
    now.getTime() - securityConfig.idleMinutes * 60 * 1000
  );
  const [sessions] = await pool.execute(
    `
      SELECT id, verified_at, last_seen_at, absolute_expires_at
      FROM admin_elevation_sessions
      WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL
        AND last_seen_at > ? AND absolute_expires_at > ?
      LIMIT 1
    `,
    [userId, hashSessionToken(sessionToken), idleCutoff, now]
  );
  const session = sessions[0];
  if (!session) return status;

  if (touch) {
    await pool.execute(
      `
        UPDATE admin_elevation_sessions
        SET last_seen_at = ?
        WHERE id = ? AND revoked_at IS NULL AND absolute_expires_at > ?
      `,
      [now, session.id, now]
    );
  }

  const activityAt = touch ? now : new Date(session.last_seen_at);
  const idleExpiresAt = new Date(
    activityAt.getTime() + securityConfig.idleMinutes * 60 * 1000
  );
  const absoluteExpiresAt = new Date(session.absolute_expires_at);
  const verifiedAt = new Date(session.verified_at);
  status.elevated = true;
  status.expiresAt = new Date(Math.min(idleExpiresAt.getTime(), absoluteExpiresAt.getTime()));
  status.freshUntil = new Date(
    verifiedAt.getTime() + securityConfig.freshMinutes * 60 * 1000
  );
  status.sessionId = session.id;
  return status;
};

const revokeElevationSession = async (userId, sessionToken = '') => {
  if (!sessionToken) return false;
  const pool = getPool();
  await ensureAdminSecurityTables(pool);
  const [result] = await pool.execute(
    `
      UPDATE admin_elevation_sessions
      SET revoked_at = NOW()
      WHERE user_id = ? AND token_hash = ? AND revoked_at IS NULL
    `,
    [userId, hashSessionToken(sessionToken)]
  );
  return Number(result.affectedRows || 0) > 0;
};

module.exports = {
  AdminSecurityError,
  startEnrollment,
  confirmEnrollment,
  verifyFactor,
  getSecurityStatus,
  revokeElevationSession
};
