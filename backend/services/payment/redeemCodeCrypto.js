const crypto = require('crypto');

const appConfig = require('../../config/app');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

const getKeyMaterial = () => String(appConfig.redeemCode?.encryptionKey || '').trim();

const deriveKey = (label) => crypto
  .createHash('sha256')
  .update(`${label}:${getKeyMaterial()}`)
  .digest();

const getEncryptionKey = () => deriveKey('redeem-code-encryption');
const getLookupKey = () => deriveKey('redeem-code-lookup');

const normalizeCode = (code = '') => String(code || '').trim();

const getRedeemCodeLookupHash = (code = '') => crypto
  .createHmac('sha256', getLookupKey())
  .update(normalizeCode(code))
  .digest('hex');

const encryptRedeemCode = (code = '') => {
  const normalized = normalizeCode(code);
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalized, 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();
  const codeLookupHash = getRedeemCodeLookupHash(normalized);

  return {
    codeStorageValue: `enc:v1:${codeLookupHash.slice(0, 24)}`,
    codeCiphertext: ciphertext.toString('base64'),
    codeIv: iv.toString('base64'),
    codeAuthTag: authTag.toString('base64'),
    codeLookupHash
  };
};

const isEncryptedRedeemCodeRow = (row = {}) => Boolean(
  row.code_ciphertext
  && row.code_iv
  && row.code_auth_tag
);

const decryptRedeemCode = (row = {}) => {
  if (!isEncryptedRedeemCodeRow(row)) {
    throw new Error('Encrypted redeem code data is missing');
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(row.code_iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(row.code_auth_tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(row.code_ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
};

module.exports = {
  encryptRedeemCode,
  decryptRedeemCode,
  getRedeemCodeLookupHash,
  isEncryptedRedeemCodeRow,
  normalizeCode
};
