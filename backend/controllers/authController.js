const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');
const { executeQuery } = require('../config/database');
const { generateToken } = require('../middleware/auth');
const appConfig = require('../config/app');

const AUTH_COOKIE_NAME = appConfig.jwt.cookieName || 'dpcc_auth_token';
const AUTH_COOKIE_MAX_AGE = Number(appConfig.jwt.cookieDays || 30) * 24 * 60 * 60 * 1000;
const isProduction = appConfig.server.nodeEnv === 'production';
const DEFAULT_AVATAR_URL = '/avatars/default-avatar.svg';
const AVATAR_OUTPUT_SIZE = Number(process.env.AVATAR_SIZE || 256);
const AVATAR_WEBP_QUALITY = Number(process.env.AVATAR_WEBP_QUALITY || 82);
const COVER_OUTPUT_MAX_WIDTH = Number(process.env.COVER_MAX_WIDTH || 1920);
const COVER_OUTPUT_MAX_HEIGHT = Number(process.env.COVER_MAX_HEIGHT || 1080);
const COVER_WEBP_QUALITY = Number(process.env.COVER_WEBP_QUALITY || 84);
const WECHAT_PROVIDER = 'wechat';
const WECHAT_STATE_COOKIE_NAME = appConfig.wechat.stateCookieName || 'dpcc_wechat_oauth_state';
const WECHAT_RETURN_TO_COOKIE_NAME = `${WECHAT_STATE_COOKIE_NAME}_return_to`;
const WECHAT_BIND_CONTEXT_COOKIE_NAME = `${WECHAT_STATE_COOKIE_NAME}_bind_ctx`;
const WECHAT_STATE_TTL_SECONDS = Number(appConfig.wechat.stateTtlSeconds || 600);
const WECHAT_STATE_COOKIE_MAX_AGE = WECHAT_STATE_TTL_SECONDS * 1000;
const GOOGLE_PROVIDER = 'google';
const GOOGLE_STATE_COOKIE_NAME = appConfig.google.stateCookieName || 'dpcc_google_oauth_state';
const GOOGLE_RETURN_TO_COOKIE_NAME = `${GOOGLE_STATE_COOKIE_NAME}_return_to`;
const GOOGLE_BIND_CONTEXT_COOKIE_NAME = `${GOOGLE_STATE_COOKIE_NAME}_bind_ctx`;
const GOOGLE_CODE_VERIFIER_COOKIE_NAME = `${GOOGLE_STATE_COOKIE_NAME}_code_verifier`;
const GOOGLE_STATE_TTL_SECONDS = Number(appConfig.google.stateTtlSeconds || 600);
const GOOGLE_STATE_COOKIE_MAX_AGE = GOOGLE_STATE_TTL_SECONDS * 1000;

let avatarColumnAvailableCache = null;
let userProfileColumnsCache = null;
let userProfileColumnsInitPromise = null;
let oauthTableReady = false;
let oauthTableInitPromise = null;

async function isAvatarColumnAvailable() {
  if (avatarColumnAvailableCache !== null) {
    return avatarColumnAvailableCache;
  }

  try {
    const result = await executeQuery(
      `SELECT COUNT(*) AS count
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'users'
         AND COLUMN_NAME = 'avatar_url'`
    );
    avatarColumnAvailableCache = Number(result?.[0]?.count || 0) > 0;
  } catch (error) {
    console.warn('检查 avatar_url 字段失败，回退为无头像字段模式:', error.message);
    avatarColumnAvailableCache = false;
  }

  return avatarColumnAvailableCache;
}

const USER_PROFILE_COLUMN_DEFS = {
  cover_url: 'VARCHAR(512) NULL',
  bio: 'TEXT NULL',
  preferred_language: 'VARCHAR(64) NULL',
  preferred_engine: 'VARCHAR(64) NULL'
};

async function loadUserProfileColumns() {
  const rows = await executeQuery(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'users'
       AND COLUMN_NAME IN (?, ?, ?, ?)`,
    ['cover_url', 'bio', 'preferred_language', 'preferred_engine']
  );

  const set = new Set(rows.map((item) => String(item.COLUMN_NAME || item.column_name || '').toLowerCase()));
  return {
    cover_url: set.has('cover_url'),
    bio: set.has('bio'),
    preferred_language: set.has('preferred_language'),
    preferred_engine: set.has('preferred_engine')
  };
}

async function ensureUserProfileColumns() {
  if (userProfileColumnsCache) {
    return userProfileColumnsCache;
  }

  if (userProfileColumnsInitPromise) {
    await userProfileColumnsInitPromise;
    return userProfileColumnsCache || {
      cover_url: false,
      bio: false,
      preferred_language: false,
      preferred_engine: false
    };
  }

  userProfileColumnsInitPromise = (async () => {
    try {
      let currentColumns = await loadUserProfileColumns();
      const missingColumns = Object.keys(USER_PROFILE_COLUMN_DEFS)
        .filter((name) => !currentColumns[name]);

      for (const columnName of missingColumns) {
        await executeQuery(
          `ALTER TABLE users ADD COLUMN ${columnName} ${USER_PROFILE_COLUMN_DEFS[columnName]}`
        );
      }

      if (missingColumns.length > 0) {
        currentColumns = await loadUserProfileColumns();
      }

      userProfileColumnsCache = currentColumns;
    } catch (error) {
      console.warn('初始化用户资料字段失败，回退为兼容模式:', error.message);
      userProfileColumnsCache = {
        cover_url: false,
        bio: false,
        preferred_language: false,
        preferred_engine: false
      };
    } finally {
      userProfileColumnsInitPromise = null;
    }
  })();

  await userProfileColumnsInitPromise;
  return userProfileColumnsCache;
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    avatar_url: user.avatar_url || DEFAULT_AVATAR_URL,
    cover_url: user.cover_url || '',
    bio: user.bio || '',
    preferred_language: user.preferred_language || '',
    preferred_engine: user.preferred_engine || ''
  };
}

async function fetchUserById(userId) {
  const hasAvatarColumn = await isAvatarColumnAvailable();
  const profileColumns = await ensureUserProfileColumns();
  const selectFields = [
    'id',
    'username',
    'email',
    'role',
    'status',
    'created_at'
  ];
  const params = [];

  if (hasAvatarColumn) {
    selectFields.push('COALESCE(avatar_url, ?) AS avatar_url');
    params.push(DEFAULT_AVATAR_URL);
  }
  if (profileColumns.cover_url) {
    selectFields.push('cover_url');
  }
  if (profileColumns.bio) {
    selectFields.push('bio');
  }
  if (profileColumns.preferred_language) {
    selectFields.push('preferred_language');
  }
  if (profileColumns.preferred_engine) {
    selectFields.push('preferred_engine');
  }

  const query = `SELECT ${selectFields.join(', ')} FROM users WHERE id = ?`;
  params.push(userId);
  const users = await executeQuery(query, params);
  if (!users || users.length === 0) return null;
  return normalizeUser(users[0]);
}

async function safeUnlink(filePath) {
  if (!filePath) return;
  try {
    await fs.unlink(filePath);
  } catch {
  }
}

async function processAvatarImage(inputPath) {
  if (!inputPath) {
    throw new Error('头像文件路径无效');
  }

  const parsedPath = path.parse(inputPath);
  const outputFilename = String(parsedPath.ext || '').toLowerCase() === '.webp'
    ? `${parsedPath.name}-processed.webp`
    : `${parsedPath.name}.webp`;
  const outputPath = path.join(parsedPath.dir, outputFilename);

  await sharp(inputPath)
    .rotate()
    .resize(AVATAR_OUTPUT_SIZE, AVATAR_OUTPUT_SIZE, { fit: 'cover', position: 'attention' })
    .webp({ quality: AVATAR_WEBP_QUALITY })
    .toFile(outputPath);

  if (outputPath !== inputPath) {
    await safeUnlink(inputPath);
  }

  return {
    outputPath,
    outputFilename: path.basename(outputPath)
  };
}

async function processCoverImage(inputPath) {
  if (!inputPath) {
    throw new Error('封面文件路径无效');
  }

  const parsedPath = path.parse(inputPath);
  const outputFilename = String(parsedPath.ext || '').toLowerCase() === '.webp'
    ? `${parsedPath.name}-processed.webp`
    : `${parsedPath.name}.webp`;
  const outputPath = path.join(parsedPath.dir, outputFilename);

  await sharp(inputPath)
    .rotate()
    .resize(COVER_OUTPUT_MAX_WIDTH, COVER_OUTPUT_MAX_HEIGHT, {
      fit: 'inside',
      withoutEnlargement: true
    })
    .webp({ quality: COVER_WEBP_QUALITY })
    .toFile(outputPath);

  if (outputPath !== inputPath) {
    await safeUnlink(inputPath);
  }

  return {
    outputPath,
    outputFilename: path.basename(outputPath)
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_COOKIE_MAX_AGE
  });
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  });
}

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
      } catch {
        acc[key] = value;
      }
      return acc;
    }, {});
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || (isProduction ? 'https' : 'http');
  const forwardedHost = String(req.headers['x-forwarded-host'] || '').split(',')[0].trim();
  const host = forwardedHost || req.get('host') || '';
  return host ? `${protocol}://${host}` : '';
}

function sanitizeReturnTo(rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return '/';
  if (!value.startsWith('/')) return '/';
  if (value.startsWith('//')) return '/';
  return value;
}

function encodeCookieValue(value) {
  return encodeURIComponent(String(value || ''));
}

function decodeCookieValue(value) {
  try {
    return decodeURIComponent(String(value || ''));
  } catch {
    return '';
  }
}

function sanitizeProfileText(value, maxLength = 1000) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  return normalized.slice(0, maxLength);
}

function getWechatConfig(req) {
  const appId = appConfig.wechat.appId || '';
  const appSecret = appConfig.wechat.appSecret || '';
  const scope = appConfig.wechat.scope || 'snsapi_login';
  const callbackUrl = appConfig.wechat.callbackUrl || (() => {
    const origin = getRequestOrigin(req);
    return origin ? `${origin}/api/auth/wechat/callback` : '';
  })();

  return {
    appId,
    appSecret,
    scope,
    callbackUrl
  };
}

function isWechatConfigured(req) {
  const config = getWechatConfig(req);
  return Boolean(config.appId && config.appSecret && config.callbackUrl);
}

function getGoogleConfig(req) {
  const clientId = appConfig.google.clientId || '';
  const clientSecret = appConfig.google.clientSecret || '';
  const scope = appConfig.google.scope || 'openid email profile';
  const callbackUrl = appConfig.google.callbackUrl || (() => {
    const origin = getRequestOrigin(req);
    return origin ? `${origin}/api/auth/google/callback` : '';
  })();

  return {
    clientId,
    clientSecret,
    scope,
    callbackUrl
  };
}

function isGoogleConfigured(req) {
  const config = getGoogleConfig(req);
  return Boolean(config.clientId && config.callbackUrl);
}

function clearWechatStateCookies(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  };
  res.clearCookie(WECHAT_STATE_COOKIE_NAME, cookieOptions);
  res.clearCookie(WECHAT_RETURN_TO_COOKIE_NAME, cookieOptions);
  res.clearCookie(WECHAT_BIND_CONTEXT_COOKIE_NAME, cookieOptions);
}

function clearGoogleStateCookies(res) {
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/'
  };
  res.clearCookie(GOOGLE_STATE_COOKIE_NAME, cookieOptions);
  res.clearCookie(GOOGLE_RETURN_TO_COOKIE_NAME, cookieOptions);
  res.clearCookie(GOOGLE_BIND_CONTEXT_COOKIE_NAME, cookieOptions);
  res.clearCookie(GOOGLE_CODE_VERIFIER_COOKIE_NAME, cookieOptions);
}

function base64UrlEncode(text = '') {
  return Buffer.from(String(text), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function base64UrlDecode(base64UrlText = '') {
  const normalized = String(base64UrlText)
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const paddingLength = normalized.length % 4;
  const padded = paddingLength === 0
    ? normalized
    : normalized + '='.repeat(4 - paddingLength);
  return Buffer.from(padded, 'base64').toString('utf8');
}

function signWechatBindPayload(encodedPayload) {
  return crypto
    .createHmac('sha256', appConfig.jwt.secret || 'dpcc-wechat-bind-fallback')
    .update(String(encodedPayload))
    .digest('hex');
}

function createOauthBindContext({ userId, state, ttlSeconds = WECHAT_STATE_TTL_SECONDS }) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payloadObject = {
    userId: Number(userId),
    state: String(state || ''),
    exp: nowSeconds + Number(ttlSeconds || WECHAT_STATE_TTL_SECONDS)
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payloadObject));
  const signature = signWechatBindPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function createWechatBindContext({ userId, state }) {
  return createOauthBindContext({
    userId,
    state,
    ttlSeconds: WECHAT_STATE_TTL_SECONDS
  });
}

function createGoogleBindContext({ userId, state }) {
  return createOauthBindContext({
    userId,
    state,
    ttlSeconds: GOOGLE_STATE_TTL_SECONDS
  });
}

function parseOauthBindContext(rawContext = '', expectedState = '') {
  const text = String(rawContext || '').trim();
  if (!text) return null;

  const parts = text.split('.');
  if (parts.length !== 2) return null;

  const [encodedPayload, signature] = parts;
  if (!encodedPayload || !signature) return null;

  const expectedSignature = signWechatBindPayload(encodedPayload);
  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length) return null;

  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const decoded = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(decoded);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const userId = Number(payload?.userId || 0);
    const exp = Number(payload?.exp || 0);
    const state = String(payload?.state || '');
    if (!userId || !exp || !state) return null;
    if (exp < nowSeconds) return null;
    if (expectedState && state !== expectedState) return null;

    return {
      userId,
      exp,
      state
    };
  } catch {
    return null;
  }
}

function parseWechatBindContext(rawContext = '', expectedState = '') {
  return parseOauthBindContext(rawContext, expectedState);
}

function parseGoogleBindContext(rawContext = '', expectedState = '') {
  return parseOauthBindContext(rawContext, expectedState);
}

function buildWechatAuthorizeUrl({ appId, callbackUrl, scope, state }) {
  const normalizedScope = scope || 'snsapi_login';
  const authEndpoint = normalizedScope === 'snsapi_login'
    ? 'https://open.weixin.qq.com/connect/qrconnect'
    : 'https://open.weixin.qq.com/connect/oauth2/authorize';

  const params = new URLSearchParams({
    appid: appId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: normalizedScope,
    state
  });

  return `${authEndpoint}?${params.toString()}#wechat_redirect`;
}

function buildGoogleCodeChallenge(codeVerifier = '') {
  const digest = crypto.createHash('sha256').update(String(codeVerifier)).digest('base64');
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function buildGoogleAuthorizeUrl({
  clientId,
  callbackUrl,
  scope,
  state,
  codeChallenge
}) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: scope || 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'consent'
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function sanitizeOAuthUsername(rawNickname) {
  const stripped = String(rawNickname || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '');
  return stripped.slice(0, 40) || 'wx_user';
}

function sanitizeWechatUsername(rawNickname) {
  return sanitizeOAuthUsername(rawNickname);
}

async function findAvailableUsername(baseName) {
  const maxLength = 50;
  const normalizedBase = (baseName || 'wx_user').slice(0, maxLength);

  for (let i = 0; i < 30; i += 1) {
    const suffix = i === 0 ? '' : `_${Math.floor(1000 + Math.random() * 9000)}`;
    const candidate = `${normalizedBase.slice(0, maxLength - suffix.length)}${suffix}`;
    const users = await executeQuery('SELECT id FROM users WHERE username = ? LIMIT 1', [candidate]);
    if (!users.length) return candidate;
  }

  return `wx_${crypto.randomBytes(6).toString('hex')}`;
}

async function ensureOauthTable() {
  if (oauthTableReady) return;
  if (oauthTableInitPromise) {
    await oauthTableInitPromise;
    return;
  }

  oauthTableInitPromise = executeQuery(
    `CREATE TABLE IF NOT EXISTS user_oauth_accounts (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      provider VARCHAR(32) NOT NULL,
      provider_user_id VARCHAR(128) NOT NULL,
      union_id VARCHAR(128) NULL,
      provider_username VARCHAR(255) NULL,
      provider_avatar_url VARCHAR(512) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_user_oauth_provider_user (provider, provider_user_id),
      KEY idx_user_oauth_user_id (user_id),
      KEY idx_user_oauth_provider_union (provider, union_id),
      CONSTRAINT fk_user_oauth_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

  try {
    await oauthTableInitPromise;
    oauthTableReady = true;
  } finally {
    oauthTableInitPromise = null;
  }
}

function isValidHttpUrl(value) {
  if (!value) return false;
  return /^https?:\/\//i.test(String(value).trim());
}

async function getOrCreateWechatUser(wechatProfile = {}) {
  await ensureOauthTable();

  const openId = String(wechatProfile.openid || '').trim();
  const unionId = String(wechatProfile.unionid || '').trim();
  const nickname = String(wechatProfile.nickname || '').trim();
  const avatarUrl = isValidHttpUrl(wechatProfile.headimgurl)
    ? String(wechatProfile.headimgurl).trim()
    : DEFAULT_AVATAR_URL;

  if (!openId) {
    throw new Error('微信用户标识缺失');
  }

  let accountRows = await executeQuery(
    `SELECT user_id
     FROM user_oauth_accounts
     WHERE provider = ? AND provider_user_id = ?
     LIMIT 1`,
    [WECHAT_PROVIDER, openId]
  );

  if (!accountRows.length && unionId) {
    accountRows = await executeQuery(
      `SELECT user_id
       FROM user_oauth_accounts
       WHERE provider = ? AND union_id = ?
       LIMIT 1`,
      [WECHAT_PROVIDER, unionId]
    );
  }

  let userId = accountRows?.[0]?.user_id ? Number(accountRows[0].user_id) : null;
  let user = userId ? await fetchUserById(userId) : null;

  if (!user) {
    const baseUsername = sanitizeWechatUsername(nickname);
    const username = await findAvailableUsername(baseUsername);
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const hasAvatarColumn = await isAvatarColumnAvailable();

    const insertResult = await executeQuery(
      hasAvatarColumn
        ? `INSERT INTO users (username, password_hash, email, role, status, avatar_url)
           VALUES (?, ?, ?, ?, ?, ?)`
        : `INSERT INTO users (username, password_hash, email, role, status)
           VALUES (?, ?, ?, ?, ?)`,
      hasAvatarColumn
        ? [username, passwordHash, null, 'user', 'active', avatarUrl]
        : [username, passwordHash, null, 'user', 'active']
    );

    userId = Number(insertResult.insertId);
    user = await fetchUserById(userId);
  }

  await executeQuery(
    `INSERT INTO user_oauth_accounts
      (user_id, provider, provider_user_id, union_id, provider_username, provider_avatar_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      union_id = VALUES(union_id),
      provider_username = VALUES(provider_username),
      provider_avatar_url = VALUES(provider_avatar_url),
      updated_at = CURRENT_TIMESTAMP`,
    [userId, WECHAT_PROVIDER, openId, unionId || null, nickname || null, avatarUrl || null]
  );

  return user || fetchUserById(userId);
}

async function bindWechatToExistingUser({ userId, wechatProfile = {} }) {
  await ensureOauthTable();

  const targetUserId = Number(userId || 0);
  if (!targetUserId) {
    throw new Error('绑定目标用户无效');
  }

  const user = await fetchUserById(targetUserId);
  if (!user) {
    throw new Error('用户不存在');
  }

  const openId = String(wechatProfile.openid || '').trim();
  const unionId = String(wechatProfile.unionid || '').trim();
  const nickname = String(wechatProfile.nickname || '').trim();
  const avatarUrl = isValidHttpUrl(wechatProfile.headimgurl)
    ? String(wechatProfile.headimgurl).trim()
    : null;

  if (!openId) {
    throw new Error('微信用户标识缺失');
  }

  const existedByOpenId = await executeQuery(
    `SELECT user_id
     FROM user_oauth_accounts
     WHERE provider = ? AND provider_user_id = ?
     LIMIT 1`,
    [WECHAT_PROVIDER, openId]
  );
  if (existedByOpenId.length && Number(existedByOpenId[0].user_id) !== targetUserId) {
    throw new Error('该微信账号已绑定到其他平台账户');
  }

  const existedForUser = await executeQuery(
    `SELECT provider_user_id
     FROM user_oauth_accounts
     WHERE provider = ? AND user_id = ?
     LIMIT 1`,
    [WECHAT_PROVIDER, targetUserId]
  );
  if (
    existedForUser.length
    && String(existedForUser[0].provider_user_id || '').trim()
    && String(existedForUser[0].provider_user_id || '').trim() !== openId
  ) {
    throw new Error('当前账号已绑定其他微信，请先解绑后再绑定新微信');
  }

  await executeQuery(
    `INSERT INTO user_oauth_accounts
      (user_id, provider, provider_user_id, union_id, provider_username, provider_avatar_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      union_id = VALUES(union_id),
      provider_username = VALUES(provider_username),
      provider_avatar_url = VALUES(provider_avatar_url),
      updated_at = CURRENT_TIMESTAMP`,
    [targetUserId, WECHAT_PROVIDER, openId, unionId || null, nickname || null, avatarUrl || null]
  );

  return {
    bound: true,
    openid: openId,
    nickname,
    avatarUrl
  };
}

function maskProviderUserId(value = '') {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***${text.slice(-2)}`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

async function exchangeWechatCodeForToken({ appId, appSecret, code }) {
  const params = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    code,
    grant_type: 'authorization_code'
  });

  const response = await fetch(`https://api.weixin.qq.com/sns/oauth2/access_token?${params.toString()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.errcode) {
    const detail = data?.errmsg || `HTTP ${response.status}`;
    throw new Error(`微信令牌获取失败: ${detail}`);
  }

  return data;
}

async function fetchWechatUserProfile({ accessToken, openId }) {
  const params = new URLSearchParams({
    access_token: accessToken,
    openid: openId,
    lang: 'zh_CN'
  });

  const response = await fetch(`https://api.weixin.qq.com/sns/userinfo?${params.toString()}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.errcode) {
    const detail = data?.errmsg || `HTTP ${response.status}`;
    throw new Error(`微信用户信息获取失败: ${detail}`);
  }

  return data;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderWechatCallbackPage({
  success,
  title,
  message,
  returnTo = '/',
  user = null
}) {
  const safeTitle = escapeHtml(title || (success ? '微信登录成功' : '微信登录失败'));
  const safeMessage = escapeHtml(message || '');
  const safeReturnTo = sanitizeReturnTo(returnTo);
  const payload = JSON.stringify({
    user: user || null,
    returnTo: safeReturnTo
  });

  const script = success
    ? `<script>
      (function () {
        var payload = ${payload};
        try {
          if (payload.user) {
            localStorage.setItem('currentUser', JSON.stringify(payload.user));
          }
        } catch (error) {}
        window.location.replace(payload.returnTo || '/');
      })();
    </script>`
    : '';

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeTitle}</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: #0a0a0a;
      color: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .card {
      width: min(92vw, 420px);
      border: 1px solid #2a2a2a;
      border-radius: 14px;
      padding: 22px 20px;
      background: #121212;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 18px;
      font-weight: 600;
    }
    p {
      margin: 0;
      color: #cfcfcf;
      line-height: 1.6;
      font-size: 14px;
    }
    a {
      color: #ffffff;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>${safeTitle}</h1>
    <p>${safeMessage || (success ? '正在返回应用，请稍候。' : '请关闭当前页面并重试。')}</p>
    <p style="margin-top: 10px;"><a href="${escapeHtml(safeReturnTo)}">返回应用</a></p>
  </div>
  ${script}
</body>
</html>`;
}

async function startWechatLogin(req, res) {
  try {
    if (!isWechatConfigured(req)) {
      return res.status(503).json({ error: '微信登录未配置，请联系管理员' });
    }

    const wechatConfig = getWechatConfig(req);
    const state = crypto.randomBytes(16).toString('hex');
    const returnTo = sanitizeReturnTo(req.query.returnTo);

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: WECHAT_STATE_COOKIE_MAX_AGE
    };

    res.cookie(WECHAT_STATE_COOKIE_NAME, state, cookieOptions);
    res.cookie(WECHAT_RETURN_TO_COOKIE_NAME, encodeCookieValue(returnTo), cookieOptions);

    const authUrl = buildWechatAuthorizeUrl({
      appId: wechatConfig.appId,
      callbackUrl: wechatConfig.callbackUrl,
      scope: wechatConfig.scope,
      state
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error('启动微信登录失败:', error);
    return res.status(500).json({ error: '微信登录初始化失败' });
  }
}

async function startWechatBind(req, res) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: '请先登录后再绑定微信' });
    }

    if (!isWechatConfigured(req)) {
      return res.status(503).json({ error: '微信登录未配置，请联系管理员' });
    }

    const wechatConfig = getWechatConfig(req);
    const state = crypto.randomBytes(16).toString('hex');
    const returnTo = sanitizeReturnTo(req.query.returnTo || '/account');
    const bindContext = createGoogleBindContext({
      userId: req.user.userId,
      state
    });

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: WECHAT_STATE_COOKIE_MAX_AGE
    };

    res.cookie(WECHAT_STATE_COOKIE_NAME, state, cookieOptions);
    res.cookie(WECHAT_RETURN_TO_COOKIE_NAME, encodeCookieValue(returnTo), cookieOptions);
    res.cookie(WECHAT_BIND_CONTEXT_COOKIE_NAME, bindContext, cookieOptions);

    const authUrl = buildWechatAuthorizeUrl({
      appId: wechatConfig.appId,
      callbackUrl: wechatConfig.callbackUrl,
      scope: wechatConfig.scope,
      state
    });

    return res.redirect(authUrl);
  } catch (error) {
    console.error('启动微信绑定失败:', error);
    return res.status(500).json({ error: '微信绑定初始化失败' });
  }
}

async function getWechatBindStatus(req, res) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    await ensureOauthTable();
    const rows = await executeQuery(
      `SELECT provider_user_id, provider_username, provider_avatar_url, created_at, updated_at
       FROM user_oauth_accounts
       WHERE provider = ? AND user_id = ?
       LIMIT 1`,
      [WECHAT_PROVIDER, req.user.userId]
    );
    const row = rows?.[0] || null;

    return res.json({
      bound: Boolean(row),
      account: row
        ? {
          provider_user_id_masked: maskProviderUserId(row.provider_user_id),
          provider_username: row.provider_username || '',
          provider_avatar_url: row.provider_avatar_url || '',
          bound_at: row.created_at,
          updated_at: row.updated_at
        }
        : null
    });
  } catch (error) {
    console.error('获取微信绑定状态失败:', error);
    return res.status(500).json({ error: '获取微信绑定状态失败' });
  }
}

async function exchangeGoogleCodeForToken({
  clientId,
  clientSecret,
  callbackUrl,
  code,
  codeVerifier
}) {
  const endpoint = 'https://oauth2.googleapis.com/token';
  const payload = new URLSearchParams({
    code,
    client_id: clientId,
    redirect_uri: callbackUrl,
    grant_type: 'authorization_code',
    code_verifier: codeVerifier
  });

  if (clientSecret) {
    payload.set('client_secret', clientSecret);
  }

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString(),
      signal: AbortSignal.timeout(12000)
    });
  } catch (networkError) {
    const details = networkError?.cause?.message || networkError?.message || 'unknown';
    throw new Error(`Google 令牌请求失败：无法连接 ${endpoint}（${details}）`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const detail = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`Google 令牌获取失败: ${detail}`);
  }

  return data;
}

async function fetchGoogleUserProfile({ accessToken }) {
  if (!accessToken) {
    throw new Error('Google access_token 缺失');
  }

  const endpoint = 'https://openidconnect.googleapis.com/v1/userinfo';
  let response;
  try {
    response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`
      },
      signal: AbortSignal.timeout(12000)
    });
  } catch (networkError) {
    const details = networkError?.cause?.message || networkError?.message || 'unknown';
    throw new Error(`Google 用户信息请求失败：无法连接 ${endpoint}（${details}）`);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.error) {
    const detail = data?.error_description || data?.error || `HTTP ${response.status}`;
    throw new Error(`Google 用户信息获取失败: ${detail}`);
  }

  return data;
}

function normalizeGoogleProfile(profile = {}) {
  const subject = String(profile.sub || profile.id || '').trim();
  const email = String(profile.email || '').trim();
  const emailVerified = profile.email_verified === true || profile.verified_email === true;
  const displayName = String(
    profile.name
      || profile.given_name
      || (email ? email.split('@')[0] : '')
      || ''
  ).trim();
  const avatarUrl = isValidHttpUrl(profile.picture) ? String(profile.picture).trim() : null;

  return {
    subject,
    email,
    emailVerified,
    displayName,
    avatarUrl
  };
}

async function getOrCreateGoogleUser(googleProfile = {}) {
  await ensureOauthTable();

  const normalized = normalizeGoogleProfile(googleProfile);
  if (!normalized.subject) {
    throw new Error('Google 用户标识缺失');
  }

  let accountRows = await executeQuery(
    `SELECT user_id
     FROM user_oauth_accounts
     WHERE provider = ? AND provider_user_id = ?
     LIMIT 1`,
    [GOOGLE_PROVIDER, normalized.subject]
  );

  let userId = accountRows?.[0]?.user_id ? Number(accountRows[0].user_id) : null;

  if (!userId && normalized.email && normalized.emailVerified) {
    const userRows = await executeQuery(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1',
      [normalized.email]
    );
    if (userRows.length) {
      userId = Number(userRows[0].id);
    }
  }

  let user = userId ? await fetchUserById(userId) : null;

  if (!user) {
    const usernameSeed = normalized.displayName || normalized.email || 'google_user';
    const username = await findAvailableUsername(sanitizeOAuthUsername(usernameSeed));
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    const hasAvatarColumn = await isAvatarColumnAvailable();
    const newAvatar = normalized.avatarUrl || DEFAULT_AVATAR_URL;

    const insertResult = await executeQuery(
      hasAvatarColumn
        ? `INSERT INTO users (username, password_hash, email, role, status, avatar_url)
           VALUES (?, ?, ?, ?, ?, ?)`
        : `INSERT INTO users (username, password_hash, email, role, status)
           VALUES (?, ?, ?, ?, ?)`,
      hasAvatarColumn
        ? [username, passwordHash, normalized.email || null, 'user', 'active', newAvatar]
        : [username, passwordHash, normalized.email || null, 'user', 'active']
    );
    userId = Number(insertResult.insertId);
    user = await fetchUserById(userId);
  }

  await executeQuery(
    `INSERT INTO user_oauth_accounts
      (user_id, provider, provider_user_id, union_id, provider_username, provider_avatar_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      union_id = VALUES(union_id),
      provider_username = VALUES(provider_username),
      provider_avatar_url = VALUES(provider_avatar_url),
      updated_at = CURRENT_TIMESTAMP`,
    [
      userId,
      GOOGLE_PROVIDER,
      normalized.subject,
      normalized.email || null,
      normalized.displayName || normalized.email || null,
      normalized.avatarUrl || null
    ]
  );

  return user || fetchUserById(userId);
}

async function bindGoogleToExistingUser({ userId, googleProfile = {} }) {
  await ensureOauthTable();

  const targetUserId = Number(userId || 0);
  if (!targetUserId) {
    throw new Error('绑定目标用户无效');
  }

  const user = await fetchUserById(targetUserId);
  if (!user) {
    throw new Error('用户不存在');
  }

  const normalized = normalizeGoogleProfile(googleProfile);
  if (!normalized.subject) {
    throw new Error('Google 用户标识缺失');
  }

  const existedBySubject = await executeQuery(
    `SELECT user_id
     FROM user_oauth_accounts
     WHERE provider = ? AND provider_user_id = ?
     LIMIT 1`,
    [GOOGLE_PROVIDER, normalized.subject]
  );
  if (existedBySubject.length && Number(existedBySubject[0].user_id) !== targetUserId) {
    throw new Error('该 Google 账号已绑定到其他平台账户');
  }

  const existedForUser = await executeQuery(
    `SELECT provider_user_id
     FROM user_oauth_accounts
     WHERE provider = ? AND user_id = ?
     LIMIT 1`,
    [GOOGLE_PROVIDER, targetUserId]
  );
  if (
    existedForUser.length
    && String(existedForUser[0].provider_user_id || '').trim()
    && String(existedForUser[0].provider_user_id || '').trim() !== normalized.subject
  ) {
    throw new Error('当前账号已绑定其他 Google 账号，请先解绑后再绑定新账号');
  }

  await executeQuery(
    `INSERT INTO user_oauth_accounts
      (user_id, provider, provider_user_id, union_id, provider_username, provider_avatar_url)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      user_id = VALUES(user_id),
      union_id = VALUES(union_id),
      provider_username = VALUES(provider_username),
      provider_avatar_url = VALUES(provider_avatar_url),
      updated_at = CURRENT_TIMESTAMP`,
    [
      targetUserId,
      GOOGLE_PROVIDER,
      normalized.subject,
      normalized.email || null,
      normalized.displayName || normalized.email || null,
      normalized.avatarUrl || null
    ]
  );

  return {
    bound: true,
    sub: normalized.subject,
    email: normalized.email,
    displayName: normalized.displayName
  };
}

async function startGoogleLogin(req, res) {
  try {
    if (!isGoogleConfigured(req)) {
      return res.status(503).json({ error: 'Google 登录未配置，请联系管理员' });
    }

    const googleConfig = getGoogleConfig(req);
    const state = crypto.randomBytes(16).toString('hex');
    const returnTo = sanitizeReturnTo(req.query.returnTo);
    const codeVerifier = crypto.randomBytes(48).toString('hex');
    const codeChallenge = buildGoogleCodeChallenge(codeVerifier);

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: GOOGLE_STATE_COOKIE_MAX_AGE
    };

    res.cookie(GOOGLE_STATE_COOKIE_NAME, state, cookieOptions);
    res.cookie(GOOGLE_RETURN_TO_COOKIE_NAME, encodeCookieValue(returnTo), cookieOptions);
    res.cookie(GOOGLE_CODE_VERIFIER_COOKIE_NAME, codeVerifier, cookieOptions);

    const authUrl = buildGoogleAuthorizeUrl({
      clientId: googleConfig.clientId,
      callbackUrl: googleConfig.callbackUrl,
      scope: googleConfig.scope,
      state,
      codeChallenge
    });
    return res.redirect(authUrl);
  } catch (error) {
    console.error('启动 Google 登录失败:', error);
    return res.status(500).json({ error: 'Google 登录初始化失败' });
  }
}

async function startGoogleBind(req, res) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: '请先登录后再绑定 Google' });
    }

    if (!isGoogleConfigured(req)) {
      return res.status(503).json({ error: 'Google 登录未配置，请联系管理员' });
    }

    const googleConfig = getGoogleConfig(req);
    const state = crypto.randomBytes(16).toString('hex');
    const returnTo = sanitizeReturnTo(req.query.returnTo || '/account');
    const bindContext = createWechatBindContext({
      userId: req.user.userId,
      state
    });
    const codeVerifier = crypto.randomBytes(48).toString('hex');
    const codeChallenge = buildGoogleCodeChallenge(codeVerifier);

    const cookieOptions = {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
      maxAge: GOOGLE_STATE_COOKIE_MAX_AGE
    };

    res.cookie(GOOGLE_STATE_COOKIE_NAME, state, cookieOptions);
    res.cookie(GOOGLE_RETURN_TO_COOKIE_NAME, encodeCookieValue(returnTo), cookieOptions);
    res.cookie(GOOGLE_BIND_CONTEXT_COOKIE_NAME, bindContext, cookieOptions);
    res.cookie(GOOGLE_CODE_VERIFIER_COOKIE_NAME, codeVerifier, cookieOptions);

    const authUrl = buildGoogleAuthorizeUrl({
      clientId: googleConfig.clientId,
      callbackUrl: googleConfig.callbackUrl,
      scope: googleConfig.scope,
      state,
      codeChallenge
    });
    return res.redirect(authUrl);
  } catch (error) {
    console.error('启动 Google 绑定失败:', error);
    return res.status(500).json({ error: 'Google 绑定初始化失败' });
  }
}

async function getGoogleBindStatus(req, res) {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({ error: '未认证' });
    }

    await ensureOauthTable();
    const rows = await executeQuery(
      `SELECT provider_user_id, union_id, provider_username, provider_avatar_url, created_at, updated_at
       FROM user_oauth_accounts
       WHERE provider = ? AND user_id = ?
       LIMIT 1`,
      [GOOGLE_PROVIDER, req.user.userId]
    );
    const row = rows?.[0] || null;

    return res.json({
      bound: Boolean(row),
      account: row
        ? {
            provider_user_id_masked: maskProviderUserId(row.provider_user_id),
            email: row.union_id || '',
            provider_username: row.provider_username || '',
            provider_avatar_url: row.provider_avatar_url || '',
            bound_at: row.created_at,
            updated_at: row.updated_at
          }
        : null
    });
  } catch (error) {
    console.error('获取 Google 绑定状态失败:', error);
    return res.status(500).json({ error: '获取 Google 绑定状态失败' });
  }
}

async function handleGoogleCallback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  const cookies = parseCookies(req.headers.cookie || '');
  const expectedState = cookies[GOOGLE_STATE_COOKIE_NAME] || '';
  const returnTo = sanitizeReturnTo(decodeCookieValue(cookies[GOOGLE_RETURN_TO_COOKIE_NAME] || '/'));
  const rawBindContext = cookies[GOOGLE_BIND_CONTEXT_COOKIE_NAME] || '';
  const hasBindContext = Boolean(String(rawBindContext).trim());
  const parsedBindContext = parseGoogleBindContext(rawBindContext, String(state || ''));
  const codeVerifier = String(cookies[GOOGLE_CODE_VERIFIER_COOKIE_NAME] || '').trim();

  clearGoogleStateCookies(res);

  if (error) {
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 授权被取消',
      message: String(errorDescription || error || '用户取消授权'),
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!code || !state) {
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 登录失败',
      message: '缺少授权参数，请重新发起登录。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!expectedState || expectedState !== String(state)) {
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 登录失败',
      message: '授权状态校验失败，请重试。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (hasBindContext && !parsedBindContext) {
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 绑定失败',
      message: '绑定状态校验失败，请重新发起绑定。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!codeVerifier) {
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 登录失败',
      message: '登录会话已过期，请重新发起登录。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!isGoogleConfigured(req)) {
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 登录未配置',
      message: '服务器缺少 Google 登录参数，请联系管理员配置。',
      returnTo
    });
    return res.status(503).type('html').send(html);
  }

  try {
    const googleConfig = getGoogleConfig(req);
    const tokenData = await exchangeGoogleCodeForToken({
      clientId: googleConfig.clientId,
      clientSecret: googleConfig.clientSecret,
      callbackUrl: googleConfig.callbackUrl,
      code: String(code),
      codeVerifier
    });

    const accessToken = String(tokenData.access_token || '').trim();
    if (!accessToken) {
      throw new Error('Google 返回的令牌数据不完整');
    }

    const profile = await fetchGoogleUserProfile({ accessToken });

    if (parsedBindContext?.userId) {
      await bindGoogleToExistingUser({
        userId: parsedBindContext.userId,
        googleProfile: profile
      });
      const boundUser = await fetchUserById(parsedBindContext.userId);
      const html = renderWechatCallbackPage({
        success: true,
        title: 'Google 绑定成功',
        message: '当前账号已成功绑定 Google。',
        returnTo,
        user: boundUser || null
      });
      return res.status(200).type('html').send(html);
    }

    const user = await getOrCreateGoogleUser(profile);
    if (!user) {
      throw new Error('无法创建或获取用户信息');
    }

    const token = generateToken({
      id: user.id,
      username: user.username
    });
    setAuthCookie(res, token);

    const html = renderWechatCallbackPage({
      success: true,
      title: 'Google 登录成功',
      message: '登录成功，正在返回应用。',
      returnTo,
      token,
      user
    });
    return res.status(200).type('html').send(html);
  } catch (callbackError) {
    console.error('处理 Google 登录回调失败:', callbackError);
    const html = renderWechatCallbackPage({
      success: false,
      title: 'Google 登录失败',
      message: callbackError.message || '处理回调时发生错误',
      returnTo
    });
    return res.status(500).type('html').send(html);
  }
}

async function handleWechatCallback(req, res) {
  const { code, state, error, error_description: errorDescription } = req.query;
  const cookies = parseCookies(req.headers.cookie || '');
  const expectedState = cookies[WECHAT_STATE_COOKIE_NAME] || '';
  const returnTo = sanitizeReturnTo(decodeCookieValue(cookies[WECHAT_RETURN_TO_COOKIE_NAME] || '/'));
  const rawBindContext = cookies[WECHAT_BIND_CONTEXT_COOKIE_NAME] || '';
  const hasBindContext = Boolean(String(rawBindContext).trim());
  const parsedBindContext = parseWechatBindContext(rawBindContext, String(state || ''));

  clearWechatStateCookies(res);

  if (error) {
    const html = renderWechatCallbackPage({
      success: false,
      title: '微信授权被取消',
      message: String(errorDescription || error || '用户取消授权'),
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!code || !state) {
    const html = renderWechatCallbackPage({
      success: false,
      title: '微信登录失败',
      message: '缺少授权参数，请重新发起登录。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!expectedState || expectedState !== String(state)) {
    const html = renderWechatCallbackPage({
      success: false,
      title: '微信登录失败',
      message: '授权状态校验失败，请重试。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (hasBindContext && !parsedBindContext) {
    const html = renderWechatCallbackPage({
      success: false,
      title: '微信绑定失败',
      message: '绑定状态校验失败，请重新发起绑定。',
      returnTo
    });
    return res.status(400).type('html').send(html);
  }

  if (!isWechatConfigured(req)) {
    const html = renderWechatCallbackPage({
      success: false,
      title: '微信登录未配置',
      message: '服务器缺少微信登录参数，请联系管理员配置。',
      returnTo
    });
    return res.status(503).type('html').send(html);
  }

  try {
    const wechatConfig = getWechatConfig(req);
    const tokenData = await exchangeWechatCodeForToken({
      appId: wechatConfig.appId,
      appSecret: wechatConfig.appSecret,
      code: String(code)
    });

    const openId = String(tokenData.openid || '').trim();
    const accessToken = String(tokenData.access_token || '').trim();
    if (!openId || !accessToken) {
      throw new Error('微信返回的令牌数据不完整');
    }

    const profile = await fetchWechatUserProfile({
      accessToken,
      openId
    });

    if (parsedBindContext?.userId) {
      await bindWechatToExistingUser({
        userId: parsedBindContext.userId,
        wechatProfile: profile
      });
      const boundUser = await fetchUserById(parsedBindContext.userId);
      const html = renderWechatCallbackPage({
        success: true,
        title: '微信绑定成功',
        message: '当前账号已成功绑定微信。',
        returnTo,
        user: boundUser || null
      });
      return res.status(200).type('html').send(html);
    }

    const user = await getOrCreateWechatUser(profile);
    if (!user) {
      throw new Error('无法创建或获取用户信息');
    }

    const token = generateToken({
      id: user.id,
      username: user.username
    });
    setAuthCookie(res, token);

    const html = renderWechatCallbackPage({
      success: true,
      title: '微信登录成功',
      message: '登录成功，正在返回应用。',
      returnTo,
      token,
      user
    });
    return res.status(200).type('html').send(html);
  } catch (callbackError) {
    console.error('处理微信登录回调失败:', callbackError);
    const html = renderWechatCallbackPage({
      success: false,
      title: '微信登录失败',
      message: callbackError.message || '处理回调时发生错误',
      returnTo
    });
    return res.status(500).type('html').send(html);
  }
}

async function register(req, res) {
  try {
    const { username, password, email } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    if (username.length < 3) {
      return res.status(400).json({ error: '用户名至少需要 3 个字符' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: '密码至少需要 6 个字符' });
    }

    const existingUsers = await executeQuery(
      'SELECT id FROM users WHERE username = ?',
      [username]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: '用户名已存在' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await executeQuery(
      'INSERT INTO users (username, password_hash, email, role, status) VALUES (?, ?, ?, ?, ?)',
      [username, passwordHash, email || null, 'user', 'active']
    );

    const token = generateToken({ id: result.insertId, username });
    setAuthCookie(res, token);
    const createdUser = await fetchUserById(result.insertId);

    res.status(201).json({
      message: '注册成功',
      token,
      user: createdUser || {
        id: result.insertId,
        username,
        email: email || null,
        avatar_url: DEFAULT_AVATAR_URL
      }
    });
  } catch (error) {
    console.error('注册错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function login(req, res) {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }

    const hasAvatarColumn = await isAvatarColumnAvailable();
    const users = await executeQuery(
      hasAvatarColumn
        ? 'SELECT id, username, password_hash, email, COALESCE(avatar_url, ?) AS avatar_url FROM users WHERE username = ?'
        : 'SELECT id, username, password_hash, email FROM users WHERE username = ?',
      hasAvatarColumn ? [DEFAULT_AVATAR_URL, username] : [username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const user = users[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    const token = generateToken(user);
    setAuthCookie(res, token);
    const loginUser = await fetchUserById(user.id);

    res.json({
      message: '登录成功',
      token,
      user: loginUser || normalizeUser({
        id: user.id,
        username: user.username,
        email: user.email,
        avatar_url: user.avatar_url
      })
    });
  } catch (error) {
    console.error('登录错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function getCurrentUser(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }

    const user = await fetchUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json({ user });
  } catch (error) {
    console.error('获取用户信息错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function getUserProfile(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }

    const user = await fetchUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    res.json(user);
  } catch (error) {
    console.error('获取用户资料错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function verifyTokenEndpoint(req, res) {
  try {
    const user = await fetchUserById(req.user.userId);
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const token = generateToken({
      id: user.id,
      username: user.username
    });
    setAuthCookie(res, token);

    res.json({
      valid: true,
      token,
      user
    });
  } catch (error) {
    console.error('验证令牌错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
}

async function updateAvatar(req, res) {
  let uploadedFilePath = req.file?.path || null;

  try {
    if (!req.user) {
      await safeUnlink(uploadedFilePath);
      return res.status(401).json({ error: '未认证' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传头像图片' });
    }

    const hasAvatarColumn = await isAvatarColumnAvailable();
    if (!hasAvatarColumn) {
      await safeUnlink(uploadedFilePath);
      return res.status(500).json({ error: '数据库缺少 avatar_url 字段，请先执行更新脚本' });
    }

    const users = await executeQuery(
      'SELECT id, avatar_url FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (!users || users.length === 0) {
      await safeUnlink(uploadedFilePath);
      return res.status(404).json({ error: '用户不存在' });
    }

    const previousAvatarUrl = users[0].avatar_url || DEFAULT_AVATAR_URL;
    const { outputPath, outputFilename } = await processAvatarImage(req.file.path);
    uploadedFilePath = outputPath;
    const newAvatarUrl = `/uploads/avatars/${outputFilename}`;

    await executeQuery(
      'UPDATE users SET avatar_url = ? WHERE id = ?',
      [newAvatarUrl, req.user.userId]
    );

    const uploadsRoot = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
    const isCustomPreviousAvatar =
      previousAvatarUrl &&
      previousAvatarUrl.startsWith('/uploads/avatars/') &&
      previousAvatarUrl !== DEFAULT_AVATAR_URL;

    if (isCustomPreviousAvatar) {
      const previousFilename = path.basename(previousAvatarUrl);
      if (previousFilename && previousFilename !== outputFilename) {
        const previousAvatarPath = path.join(uploadsRoot, 'avatars', previousFilename);
        await safeUnlink(previousAvatarPath);
      }
    }

    const user = await fetchUserById(req.user.userId);
    uploadedFilePath = null;

    res.json({
      message: '头像更新成功',
      user: user || {
        id: req.user.userId,
        username: req.user.username,
        avatar_url: newAvatarUrl
      }
    });
  } catch (error) {
    console.error('更新头像错误:', error);
    await safeUnlink(uploadedFilePath);
    res.status(500).json({ error: '头像上传失败' });
  }
}

async function updateCover(req, res) {
  let uploadedFilePath = req.file?.path || null;

  try {
    if (!req.user) {
      await safeUnlink(uploadedFilePath);
      return res.status(401).json({ error: '未认证' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '请上传封面图片' });
    }

    const profileColumns = await ensureUserProfileColumns();
    if (!profileColumns.cover_url) {
      await safeUnlink(uploadedFilePath);
      return res.status(500).json({ error: '数据库缺少 cover_url 字段，请先执行更新脚本' });
    }

    const users = await executeQuery(
      'SELECT id, cover_url FROM users WHERE id = ?',
      [req.user.userId]
    );

    if (!users || users.length === 0) {
      await safeUnlink(uploadedFilePath);
      return res.status(404).json({ error: '用户不存在' });
    }

    const previousCoverUrl = users[0].cover_url || '';
    const { outputPath, outputFilename } = await processCoverImage(req.file.path);
    uploadedFilePath = outputPath;
    const newCoverUrl = `/uploads/covers/${outputFilename}`;

    await executeQuery(
      'UPDATE users SET cover_url = ? WHERE id = ?',
      [newCoverUrl, req.user.userId]
    );

    const uploadsRoot = process.env.UPLOADS_PATH || path.join(process.cwd(), 'uploads');
    const isCustomPreviousCover =
      previousCoverUrl &&
      previousCoverUrl.startsWith('/uploads/covers/');

    if (isCustomPreviousCover) {
      const previousFilename = path.basename(previousCoverUrl);
      if (previousFilename && previousFilename !== outputFilename) {
        const previousCoverPath = path.join(uploadsRoot, 'covers', previousFilename);
        await safeUnlink(previousCoverPath);
      }
    }

    const user = await fetchUserById(req.user.userId);
    uploadedFilePath = null;

    return res.json({
      message: '封面更新成功',
      user: user || {
        id: req.user.userId,
        username: req.user.username,
        cover_url: newCoverUrl
      }
    });
  } catch (error) {
    console.error('更新封面错误:', error);
    await safeUnlink(uploadedFilePath);
    return res.status(500).json({ error: '封面上传失败' });
  }
}

async function updateUserProfile(req, res) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: '未认证' });
    }

    const profileColumns = await ensureUserProfileColumns();
    const fields = [];
    const params = [];
    const bio = sanitizeProfileText(req.body?.bio, 1200);
    const preferredLanguage = sanitizeProfileText(req.body?.preferred_language, 64);
    const preferredEngine = sanitizeProfileText(req.body?.preferred_engine, 64);

    if (profileColumns.bio) {
      fields.push('bio = ?');
      params.push(bio || null);
    }
    if (profileColumns.preferred_language) {
      fields.push('preferred_language = ?');
      params.push(preferredLanguage || null);
    }
    if (profileColumns.preferred_engine) {
      fields.push('preferred_engine = ?');
      params.push(preferredEngine || null);
    }

    if (!fields.length) {
      return res.status(500).json({ error: '数据库缺少资料字段，请先执行更新脚本' });
    }

    params.push(req.user.userId);
    await executeQuery(
      `UPDATE users SET ${fields.join(', ')} WHERE id = ?`,
      params
    );

    const user = await fetchUserById(req.user.userId);
    return res.json({
      message: '资料保存成功',
      user
    });
  } catch (error) {
    console.error('更新用户资料错误:', error);
    return res.status(500).json({ error: '资料保存失败' });
  }
}

function logout(req, res) {
  clearAuthCookie(res);
  res.json({ message: '退出登录成功' });
}

module.exports = {
  startWechatLogin,
  startWechatBind,
  handleWechatCallback,
  getWechatBindStatus,
  startGoogleLogin,
  startGoogleBind,
  handleGoogleCallback,
  getGoogleBindStatus,
  register,
  login,
  getCurrentUser,
  getUserProfile,
  verifyTokenEndpoint,
  updateUserProfile,
  updateAvatar,
  updateCover,
  logout
};
