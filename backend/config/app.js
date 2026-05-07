const crypto = require('crypto');

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';

const getEnv = (key, fallback = '') => {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : fallback;
};

const parseCorsOrigins = () => {
  const raw = getEnv('CORS_ORIGINS', '');
  if (!raw) {
    return [
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:3000',
      'https://localhost:3000',
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'http://dpccgaming.xyz',
      'https://dpccgaming.xyz'
    ];
  }
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
};

const dbPassword = getEnv('DB_PASSWORD', '');
const jwtSecret = getEnv(
  'JWT_SECRET',
  isProduction ? '' : `dev-${crypto.randomBytes(32).toString('hex')}`
);
const redeemCodeEncryptionKey = getEnv(
  'REDEEM_CODE_ENCRYPTION_KEY',
  isProduction ? '' : 'dev-redeem-code-encryption-key-change-me'
);
const jwtExpiresIn = getEnv('JWT_EXPIRES_IN', '30d');
const jwtCookieName = getEnv('JWT_COOKIE_NAME', 'dpcc_auth_token');
const parsedJwtCookieDays = Number(process.env.JWT_COOKIE_DAYS || 30);
const jwtCookieDays =
  Number.isFinite(parsedJwtCookieDays) && parsedJwtCookieDays > 0
    ? parsedJwtCookieDays
    : 30;
const parsedWechatStateTtlSeconds = Number(process.env.WECHAT_STATE_TTL_SECONDS || 600);
const wechatStateTtlSeconds =
  Number.isFinite(parsedWechatStateTtlSeconds) && parsedWechatStateTtlSeconds > 0
    ? parsedWechatStateTtlSeconds
    : 600;
const wechatAppId =
  getEnv('WECHAT_APP_ID', '')
  || getEnv('WECHAT_APPID', '')
  || getEnv('WX_APP_ID', '');
const wechatAppSecret =
  getEnv('WECHAT_APP_SECRET', '')
  || getEnv('WECHAT_SECRET', '')
  || getEnv('WX_APP_SECRET', '');
const wechatCallbackUrl =
  getEnv('WECHAT_CALLBACK_URL', '')
  || getEnv('WECHAT_REDIRECT_URI', '')
  || getEnv('WX_CALLBACK_URL', '');
const parsedGoogleStateTtlSeconds = Number(process.env.GOOGLE_STATE_TTL_SECONDS || 600);
const googleStateTtlSeconds =
  Number.isFinite(parsedGoogleStateTtlSeconds) && parsedGoogleStateTtlSeconds > 0
    ? parsedGoogleStateTtlSeconds
    : 600;
const googleClientId =
  getEnv('GOOGLE_CLIENT_ID', '')
  || getEnv('GOOGLE_APP_ID', '')
  || getEnv('GOOGLE_APPID', '');
const googleClientSecret =
  getEnv('GOOGLE_CLIENT_SECRET', '')
  || getEnv('GOOGLE_APP_SECRET', '')
  || getEnv('GOOGLE_SECRET', '');
const googleCallbackUrl =
  getEnv('GOOGLE_CALLBACK_URL', '')
  || getEnv('GOOGLE_REDIRECT_URI', '');

if (isProduction) {
  const missing = [];
  if (!dbPassword) missing.push('DB_PASSWORD');
  if (!jwtSecret) missing.push('JWT_SECRET');
  if (!redeemCodeEncryptionKey) missing.push('REDEEM_CODE_ENCRYPTION_KEY');
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(', ')}`);
  }
}

if (!isProduction) {
  if (!dbPassword) {
    console.warn('[config] DB_PASSWORD 未设置，数据库连接可能失败。建议在 .env 中配置。');
  }
  if (!process.env.JWT_SECRET) {
    console.warn('[config] JWT_SECRET 未设置，已使用随机开发密钥（重启后会变化）。');
  } else if (jwtSecret.length < 32) {
    console.warn('[config] JWT_SECRET 长度小于 32，建议提高复杂度。');
  }
  if (!process.env.REDEEM_CODE_ENCRYPTION_KEY) {
    console.warn('[config] REDEEM_CODE_ENCRYPTION_KEY 未设置，已使用开发密钥。');
  }
}

const config = {

  server: {
    port: process.env.PORT || 3000,
    nodeEnv
  },

  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'dpccgaming',
    port: Number(process.env.DB_PORT || 3306),
    password: dbPassword,
    database: process.env.DB_NAME || 'dpccgaming',
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10)
  },

  jwt: {
    secret: jwtSecret,
    expiresIn: jwtExpiresIn,
    cookieName: jwtCookieName,
    cookieDays: jwtCookieDays
  },

  redeemCode: {
    encryptionKey: redeemCodeEncryptionKey
  },

  wechat: {
    appId: wechatAppId,
    appSecret: wechatAppSecret,
    callbackUrl: wechatCallbackUrl,
    scope: getEnv('WECHAT_SCOPE', 'snsapi_login') || 'snsapi_login',
    stateCookieName: getEnv('WECHAT_STATE_COOKIE_NAME', 'dpcc_wechat_oauth_state'),
    stateTtlSeconds: wechatStateTtlSeconds
  },

  google: {
    clientId: googleClientId,
    clientSecret: googleClientSecret,
    callbackUrl: googleCallbackUrl,
    scope: getEnv('GOOGLE_SCOPE', 'openid email profile') || 'openid email profile',
    stateCookieName: getEnv('GOOGLE_STATE_COOKIE_NAME', 'dpcc_google_oauth_state'),
    stateTtlSeconds: googleStateTtlSeconds
  },

  paths: {
    uploads: process.env.UPLOADS_PATH || 'uploads',
    games: process.env.GAMES_ROOT_PATH || 'games',
    code: process.env.CODE_ROOT_PATH || 'uploads/code',
    temp: process.env.TEMP_PATH || 'temp'
  },

  // 文件上传配置
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['.zip', '.rar', '.7z'],
    imageTypes: ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  },

  // CORS配置
  cors: {
    origins: parseCorsOrigins()
  },

  // 管理员白名单
  admin: {
    whitelist: [
      'admin',
      'dpccgamingSunJiaHao',
      'dpccgamingShenRuiYing'
    ]
  },

  // 代码浏览配置
  codeBrowser: {
    maxFiles: 60,
    maxFileSize: 200 * 1024, // 200KB
    allowedExtensions: ['.ts', '.tsx', '.js', '.jsx', '.vue', '.css', '.scss', '.less', '.html', '.json', '.md', '.c', '.cpp', '.h', '.cs', '.py']
  }
};

module.exports = config;
