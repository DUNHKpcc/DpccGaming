const crypto = require('crypto');

const ALIPAY_CHARSET = 'utf-8';
const ALIPAY_SIGN_TYPE = 'RSA2';
const ALIPAY_PAGE_PAY_METHOD = 'alipay.trade.page.pay';
const ALIPAY_TRADE_QUERY_METHOD = 'alipay.trade.query';

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

const extractJsonObjectByKey = (bodyText = '', key = '') => {
  const keyIndex = bodyText.indexOf(`"${key}"`);
  if (keyIndex < 0) return '';
  const objectStart = bodyText.indexOf('{', keyIndex);
  if (objectStart < 0) return '';

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = objectStart; index < bodyText.length; index += 1) {
    const char = bodyText[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return bodyText.slice(objectStart, index + 1);
    }
  }
  return '';
};

const verifyAlipayApiResponse = (bodyText = '', responseKey = '', signature = '', config = {}) => {
  const publicKey = config.alipayPublicKey;
  const signContent = extractJsonObjectByKey(bodyText, responseKey);
  if (!publicKey || !signature || !signContent) return false;

  try {
    return crypto
      .createVerify('RSA-SHA256')
      .update(signContent, ALIPAY_CHARSET)
      .verify(publicKey, signature, 'base64');
  } catch {
    return false;
  }
};

const normalizeAlipayBuyerId = (...sources) => {
  for (const source of sources) {
    const buyerId = String(source?.buyer_id || source?.buyerId || '').trim();
    if (buyerId) return buyerId;
    const buyerUserId = String(source?.buyer_user_id || source?.buyerUserId || '').trim();
    if (buyerUserId) return buyerUserId;
  }
  return '';
};

const buildAlipayApiParams = ({ config = {}, method = '', bizContent = {} } = {}) => {
  if (!config.appId) {
    throw new Error('支付宝 APP_ID 未配置');
  }
  if (!config.gatewayUrl) {
    throw new Error('支付宝网关未配置');
  }

  const params = {
    app_id: config.appId,
    method,
    format: 'JSON',
    charset: ALIPAY_CHARSET,
    sign_type: ALIPAY_SIGN_TYPE,
    timestamp: formatAlipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent)
  };

  params.sign = signParams(params, config.privateKey);
  return params;
};

const buildAlipayPagePayPayload = ({ config = {}, order = {} } = {}) => {
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
    ...buildAlipayApiParams({
      config,
      method: ALIPAY_PAGE_PAY_METHOD,
      bizContent
    }),
    return_url: config.returnUrl,
    notify_url: config.notifyUrl
  };
  params.sign = signParams(params, config.privateKey);

  return {
    action: appendQueryParams(config.gatewayUrl, { charset: ALIPAY_CHARSET }),
    method: 'post',
    charset: ALIPAY_CHARSET,
    params: Object.keys(params)
      .filter((key) => key !== 'charset')
      .reduce((result, key) => ({
        ...result,
        [key]: params[key]
      }), {})
  };
};

const buildAlipayTradeQueryPayload = ({ config = {}, outTradeNo = '', tradeNo = '' } = {}) => {
  const bizContent = {};
  const normalizedOutTradeNo = String(outTradeNo || '').trim();
  const normalizedTradeNo = String(tradeNo || '').trim();
  if (normalizedOutTradeNo) bizContent.out_trade_no = normalizedOutTradeNo;
  if (normalizedTradeNo) bizContent.trade_no = normalizedTradeNo;
  if (!bizContent.out_trade_no && !bizContent.trade_no) {
    throw new Error('支付宝交易查询缺少订单号');
  }

  const params = buildAlipayApiParams({
    config,
    method: ALIPAY_TRADE_QUERY_METHOD,
    bizContent
  });

  return {
    action: appendQueryParams(config.gatewayUrl, { charset: ALIPAY_CHARSET }),
    method: 'post',
    charset: ALIPAY_CHARSET,
    params
  };
};

const requestAlipayTradeQuery = async ({ config = {}, outTradeNo = '', tradeNo = '' } = {}) => {
  const payload = buildAlipayTradeQueryPayload({ config, outTradeNo, tradeNo });
  const response = await fetch(payload.action, {
    method: payload.method.toUpperCase(),
    headers: {
      'content-type': 'application/x-www-form-urlencoded;charset=utf-8'
    },
    body: new URLSearchParams(payload.params).toString()
  });
  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(`支付宝交易查询请求失败：HTTP ${response.status}`);
  }

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    throw new Error('支付宝交易查询响应不是有效 JSON');
  }

  const queryResponse = body.alipay_trade_query_response || {};
  if (!verifyAlipayApiResponse(bodyText, 'alipay_trade_query_response', body.sign, config)) {
    throw new Error('支付宝交易查询响应验签失败');
  }
  if (queryResponse.code !== '10000') {
    throw new Error(`支付宝交易查询失败：${queryResponse.sub_msg || queryResponse.msg || queryResponse.code || '未知错误'}`);
  }
  return queryResponse;
};

module.exports = {
  buildAlipayPagePayPayload,
  buildAlipayTradeQueryPayload,
  requestAlipayTradeQuery,
  normalizeAlipayBuyerId,
  verifyAlipayNotifyParams,
  verifyAlipayApiResponse,
  buildSignContent,
  formatAlipayTimestamp
};
