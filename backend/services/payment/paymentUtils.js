const crypto = require('crypto');

const PAYMENT_SUPPORT_WECHAT = '15160701051';

const PAYMENT_SUPPORT_NOTE = '售后和技术支持添加微信 15160701051';

const PAYMENT_REDEEM_URL = 'https://api.dpccgaming.xyz/console/topup';

const PAYMENT_API_USERNAME_WAIT_NOTE = '已收到 DPCC-API 平台用户名，请等待 5 分钟。';

const PAYMENT_ACCOUNT_TARGET_WAIT_NOTE = '支付已确认，请提交账号/代充服务的目标账号，售后核验后人工交付。';

const PAYMENT_ACCOUNT_TARGET_SUBMITTED_NOTE = '已收到账号/代充服务的目标账号，请等待售后核验与人工交付。';

const BONUS_REDEEM_CODE_ALREADY_USED_NOTE = '赠送兑换码每个用户仅可领取一次，本次不会重复赠送。';

const BONUS_REDEEM_CODE_PAYER_MISSING_NOTE = '未收到支付宝付款账号标识，赠送兑换码需人工核验。';

const PROMOTION_PAYER_ALREADY_USED_NOTE = '你的支付ID已购买过本次限购促销，当前订单已支付但未自动发放，请联系售后补差价或退款。';

const PROMOTION_PAYER_MISSING_NOTE = '未收到支付宝支付ID，当前限购促销订单需人工核验，请联系售后处理。';

const BONUS_CLAIM_TYPE_ALIPAY_BUYER = 'alipay_buyer';

const BONUS_CLAIM_TYPE_USER = 'user';

const toMysqlDateTime = (date = new Date()) => {
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

const addMonths = (date, months) => {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + Number(months || 0));
  return next;
};

const addMinutes = (date, minutes) => new Date(date.getTime() + (Number(minutes || 0) * 60 * 1000));

const parseStoredDateTime = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
  const date = new Date(String(value).trim().replace(' ', 'T'));
  return Number.isFinite(date.getTime()) ? date : null;
};

const isPaymentAfterOrderExpiry = (order = {}, paidAt = new Date()) => {
  const expiresAt = parseStoredDateTime(order.expires_at);
  const paymentDate = parseStoredDateTime(paidAt);
  return Boolean(expiresAt && paymentDate && paymentDate > expiresAt);
};

const createOrderNo = () => {
  const datePart = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const randomPart = crypto.randomBytes(8).toString('hex').toUpperCase();
  return `DPCC${datePart}${randomPart}`;
};

const normalizeRedeemCodes = (codes = []) => {
  const source = Array.isArray(codes) ? codes : String(codes || '').split(/\r?\n/);
  return [...new Set(source
    .map((code) => String(code || '').trim())
    .filter(Boolean))];
};

const normalizeRedeemCodeIds = (ids = []) => {
  const source = Array.isArray(ids) ? ids : [ids];
  return [...new Set(source
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];
};

const maskRedeemCode = (code = '') => {
  const normalized = String(code || '').trim();
  if (!normalized) return '';
  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}****${normalized.slice(-2)}`;
  }
  return `${normalized.slice(0, 4)}****${normalized.slice(-4)}`;
};

const buildRedeemCodes = (order = {}, options = {}) => {
  const formatCode = options.masked ? maskRedeemCode : (code) => code;
  return [
    { label: '原有额度', code: order.redeem_code },
    { label: '赠送 $30', code: order.bonus_redeem_code }
  ]
    .filter((item) => item.code)
    .map((item) => ({
      ...item,
      code: formatCode(item.code)
    }));
};

const getRedeemCodeByLabel = (redeemCodes = [], labelMatcher) => (
  redeemCodes.find((item) => labelMatcher(String(item.label || '')))?.code || ''
);

const normalizeApiUsername = (apiUsername = '') => String(apiUsername || '').trim();

const parseAlipayPaymentDate = (value = '') => {
  const normalized = String(value || '').trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;
  // 支付宝 notify_time / gmt_payment 是 GMT+8（Asia/Shanghai）无时区标记的字符串。
  // 必须显式按 +08:00 解析，不能依赖服务器本地时区：否则非 GMT+8 服务器会把时间整体错位 8 小时，
  // 导致 isDateInsideNotifyWindow / isPaymentAfterOrderExpiry 判断失真，合法回调被静默丢弃。
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`;
  const date = new Date(iso);
  // ISO 字符串形式的非法日期（如 2 月 30 日、13 月）会返回 Invalid Date，无需再像构造函数那样做回滚校验。
  return Number.isFinite(date.getTime()) ? date : null;
};

module.exports = {
  PAYMENT_SUPPORT_WECHAT,
  PAYMENT_SUPPORT_NOTE,
  PAYMENT_REDEEM_URL,
  PAYMENT_API_USERNAME_WAIT_NOTE,
  PAYMENT_ACCOUNT_TARGET_WAIT_NOTE,
  PAYMENT_ACCOUNT_TARGET_SUBMITTED_NOTE,
  BONUS_REDEEM_CODE_ALREADY_USED_NOTE,
  BONUS_REDEEM_CODE_PAYER_MISSING_NOTE,
  PROMOTION_PAYER_ALREADY_USED_NOTE,
  PROMOTION_PAYER_MISSING_NOTE,
  BONUS_CLAIM_TYPE_ALIPAY_BUYER,
  BONUS_CLAIM_TYPE_USER,
  toMysqlDateTime,
  addMonths,
  addMinutes,
  parseStoredDateTime,
  isPaymentAfterOrderExpiry,
  createOrderNo,
  normalizeRedeemCodes,
  normalizeRedeemCodeIds,
  maskRedeemCode,
  buildRedeemCodes,
  getRedeemCodeByLabel,
  normalizeApiUsername,
  parseAlipayPaymentDate
};
