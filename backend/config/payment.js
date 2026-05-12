const fs = require('fs');
const path = require('path');

const normalizePem = (value = '') => String(value || '').replace(/\\n/g, '\n').trim();

const toPemBlock = (value = '', label = 'PUBLIC KEY') => {
  const normalized = normalizePem(value);
  if (!normalized) return '';
  if (normalized.includes('-----BEGIN ')) return normalized;

  const compact = normalized.replace(/\s+/g, '');
  const lines = compact.match(/.{1,64}/g) || [];
  return [
    `-----BEGIN ${label}-----`,
    ...lines,
    `-----END ${label}-----`
  ].join('\n');
};

const getEnv = (key, fallback = '') => {
  const value = process.env[key];
  return typeof value === 'string' ? value.trim() : fallback;
};

const trimTrailingSlash = (value = '') => String(value || '').replace(/\/+$/, '');

const parseList = (value = '') => String(value || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const parsePositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const resolveConfigPath = (value = '') => {
  const rawPath = String(value || '').trim();
  if (!rawPath) return '';
  return path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath);
};

const readPemFromPath = (rawPath = '') => {
  const filePath = resolveConfigPath(rawPath);
  if (!filePath) return '';
  if (!fs.existsSync(filePath)) return '';
  try {
    return normalizePem(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return '';
  }
};

const getPemConfig = (pathKey, inlineKey, label) => {
  const filePath = getEnv(pathKey, '');
  if (filePath) {
    return toPemBlock(readPemFromPath(filePath), label);
  }
  return toPemBlock(getEnv(inlineKey, ''), label);
};

const publicUrl = trimTrailingSlash(
  getEnv('APP_PUBLIC_URL', '')
  || getEnv('PAYMENT_PUBLIC_URL', '')
  || 'http://localhost:3000'
);

const alipayGatewayUrl = getEnv(
  'ALIPAY_GATEWAY_URL',
  getEnv('ALIPAY_SANDBOX', '') === 'true'
    ? 'https://openapi-sandbox.dl.alipaydev.com/gateway.do'
    : 'https://openapi.alipay.com/gateway.do'
);

module.exports = {
  publicUrl,
  alipay: {
    appId: getEnv('ALIPAY_APP_ID', ''),
    gatewayUrl: alipayGatewayUrl,
    privateKey: getPemConfig('ALIPAY_PRIVATE_KEY_PATH', 'ALIPAY_PRIVATE_KEY', 'PRIVATE KEY'),
    alipayPublicKey: getPemConfig('ALIPAY_PUBLIC_KEY_PATH', 'ALIPAY_PUBLIC_KEY', 'PUBLIC KEY'),
    sellerId: getEnv('ALIPAY_SELLER_ID', getEnv('ALIPAY_PID', '')),
    returnUrl: getEnv('ALIPAY_RETURN_URL', `${publicUrl}/payment/result`),
    notifyUrl: getEnv('ALIPAY_NOTIFY_URL', `${publicUrl}/api/payments/alipay/notify`),
    notifyIpWhitelist: parseList(getEnv('ALIPAY_NOTIFY_IP_WHITELIST', '')),
    notifyTimeWindowMinutes: parsePositiveNumber(getEnv('ALIPAY_NOTIFY_TIME_WINDOW_MINUTES', ''), 1440)
  }
};
