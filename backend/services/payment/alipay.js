const crypto = require('crypto');

const ALIPAY_CHARSET = 'utf-8';
const ALIPAY_SIGN_TYPE = 'RSA2';
const ALIPAY_PAGE_PAY_METHOD = 'alipay.trade.page.pay';

const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;');

const appendQueryParams = (url = '', params = {}) => {
  const query = new URLSearchParams(params).toString();
  if (!query) return url;
  return `${url}${String(url).includes('?') ? '&' : '?'}${query}`;
};

const formatAlipayTimestamp = (date = new Date()) => {
  const pad = (value) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    ' ',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes()),
    ':',
    pad(date.getSeconds())
  ].join('');
};

const buildSignContent = (params = {}, options = {}) => Object.keys(params)
  .filter((key) => {
    if (key === 'sign') return false;
    if (options.excludeSignType && key === 'sign_type') return false;
    const value = params[key];
    return value !== undefined && value !== null && value !== '';
  })
  .sort()
  .map((key) => `${key}=${params[key]}`)
  .join('&');

const signParams = (params = {}, privateKey = '') => {
  if (!privateKey) {
    throw new Error('支付宝私钥未配置');
  }
  return crypto
    .createSign('RSA-SHA256')
    .update(buildSignContent(params), ALIPAY_CHARSET)
    .sign(privateKey, 'base64');
};

const verifyAlipayNotifyParams = (params = {}, config = {}) => {
  const signature = params.sign;
  const publicKey = config.alipayPublicKey;
  if (!signature || !publicKey) return false;

  try {
    return crypto
      .createVerify('RSA-SHA256')
      .update(buildSignContent(params, { excludeSignType: true }), ALIPAY_CHARSET)
      .verify(publicKey, signature, 'base64');
  } catch (error) {
    return false;
  }
};

const buildAlipayPagePayForm = ({ config = {}, order = {} } = {}) => {
  if (!config.appId) {
    throw new Error('支付宝 APP_ID 未配置');
  }
  if (!config.gatewayUrl) {
    throw new Error('支付宝网关未配置');
  }

  const bizContent = {
    out_trade_no: order.orderNo,
    product_code: 'FAST_INSTANT_TRADE_PAY',
    total_amount: order.amount,
    subject: order.subject,
    body: order.body
  };
  if (order.expiresInMinutes) {
    bizContent.timeout_express = `${Number(order.expiresInMinutes)}m`;
  }

  const params = {
    app_id: config.appId,
    method: ALIPAY_PAGE_PAY_METHOD,
    format: 'JSON',
    charset: ALIPAY_CHARSET,
    sign_type: ALIPAY_SIGN_TYPE,
    timestamp: formatAlipayTimestamp(),
    version: '1.0',
    return_url: config.returnUrl,
    notify_url: config.notifyUrl,
    biz_content: JSON.stringify(bizContent)
  };

  params.sign = signParams(params, config.privateKey);

  const inputs = Object.keys(params)
    .filter((key) => key !== 'charset')
    .map((key) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(params[key])}">`)
    .join('');
  const actionUrl = appendQueryParams(config.gatewayUrl, { charset: ALIPAY_CHARSET });

  return [
    '<!doctype html><html><head><meta charset="utf-8"><title>Alipay Redirect</title></head>',
    '<body>',
    `<form id="alipay-submit-form" action="${escapeHtml(actionUrl)}" method="post" accept-charset="${ALIPAY_CHARSET}">${inputs}</form>`,
    '<script>document.getElementById("alipay-submit-form").submit();</script>',
    '</body></html>'
  ].join('');
};

module.exports = {
  buildAlipayPagePayForm,
  verifyAlipayNotifyParams,
  buildSignContent,
  formatAlipayTimestamp
};
