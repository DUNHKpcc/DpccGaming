const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  getPaymentPlan,
  getPaymentDuration,
  getRechargePackage,
  calculateOrderAmount
} = require('../backend/services/payment/plans');
const {
  buildAlipayPagePayForm,
  verifyAlipayNotifyParams
} = require('../backend/services/payment/alipay');
const {
  handlePaidOrder
} = require('../backend/services/payment/paymentService');
const paymentRepository = require('../backend/repositories/paymentRepository');

const createKeyPair = () => crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
});

const signNotify = (params, privateKey) => {
  const content = Object.keys(params)
    .filter((key) => !['sign', 'sign_type'].includes(key))
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  return crypto
    .createSign('RSA-SHA256')
    .update(content, 'utf8')
    .sign(privateKey, 'base64');
};

test('calculates payment amount only from server-side plan catalog', () => {
  const plan = getPaymentPlan('gold');
  const duration = getPaymentDuration('3m');

  assert.equal(plan.name, '黄金月卡');
  assert.equal(duration.months, 3);
  assert.equal(calculateOrderAmount(plan, duration), '209.70');
  assert.equal(getPaymentPlan('unknown'), null);
  assert.equal(getPaymentDuration('forever'), null);
});

test('calculates recharge amount only from server-side package catalog', () => {
  const pack = getRechargePackage('usd-33');

  assert.equal(pack.name, '$33 额度包');
  assert.equal(pack.quotaUsd, '33.00');
  assert.equal(pack.price, '50.00');
  assert.equal(getRechargePackage('usd-999'), null);
});

test('uses ASCII Alipay subjects to avoid checkout mojibake', () => {
  const subjects = [
    getPaymentPlan('bronze').subject,
    getPaymentPlan('gold').subject,
    getPaymentPlan('platinum').subject,
    getRechargePackage('usd-6').subject
  ];

  for (const subject of subjects) {
    assert.match(subject, /^[\x20-\x7E]+$/);
  }
});

test('builds a signed Alipay page-pay form with locked order amount', () => {
  const { privateKey, publicKey } = createKeyPair();
  const form = buildAlipayPagePayForm({
    config: {
      appId: '2026000000000001',
      gatewayUrl: 'https://openapi.alipay.com/gateway.do',
      privateKey,
      returnUrl: 'https://dpccgaming.xyz/payment',
      notifyUrl: 'https://dpccgaming.xyz/api/payments/alipay/notify'
    },
    order: {
      orderNo: 'DPCC202605040001',
      amount: '69.90',
      subject: 'DPCC API 黄金月卡',
      body: '1个月'
    }
  });

  assert.match(form, /method="post"/);
  assert.match(form, /action="https:\/\/openapi\.alipay\.com\/gateway\.do\?[^"]*charset=utf-8/);
  assert.match(form, /name="method" value="alipay\.trade\.page\.pay"/);
  assert.match(form, /name="sign_type" value="RSA2"/);
  assert.match(form, /DPCC202605040001/);
  assert.match(form, /69\.90/);

  const params = {};
  const actionUrl = form.match(/action="([^"]+)"/)?.[1] || '';
  for (const [key, value] of new URL(actionUrl).searchParams.entries()) {
    params[key] = value;
  }
  for (const match of form.matchAll(/name="([^"]+)" value="([^"]*)"/g)) {
    params[match[1]] = match[2]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
      .replace(/&#39;/g, "'");
  }
  const signature = params.sign;
  delete params.sign;
  const content = Object.keys(params)
    .filter((key) => params[key] !== '')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');

  const verified = crypto
    .createVerify('RSA-SHA256')
    .update(content, 'utf8')
    .verify(publicKey, signature, 'base64');
  assert.equal(verified, true);
});

test('includes Alipay timeout express for the locked order window', () => {
  const { privateKey } = createKeyPair();
  const form = buildAlipayPagePayForm({
    config: {
      appId: '2026000000000001',
      gatewayUrl: 'https://openapi.alipay.com/gateway.do',
      privateKey,
      returnUrl: 'https://dpccgaming.xyz/payment',
      notifyUrl: 'https://dpccgaming.xyz/api/payments/alipay/notify'
    },
    order: {
      orderNo: 'DPCC202605040001',
      amount: '69.90',
      subject: 'DPCC API 黄金月卡',
      body: '1个月',
      expiresInMinutes: 5
    }
  });

  assert.match(form, /timeout_express/);
  assert.match(form, /5m/);
});

test('persists a server-side expiry when creating payment orders', async () => {
  const calls = [];
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 1 }];
    }
  };

  await paymentRepository.createPaymentOrder(pool, {
    orderNo: 'DPCC202605040001',
    userId: 12,
    planId: 'gold',
    durationId: '1m',
    amount: '69.90',
    subject: 'DPCC API 黄金月卡',
    expiresAt: '2026-05-04 08:05:00'
  });

  const insertCall = calls.find(([sql]) => /INSERT INTO payment_orders/.test(sql));
  assert.ok(insertCall);
  assert.match(insertCall[0], /expires_at/);
  assert.ok(insertCall[1].includes('2026-05-04 08:05:00'));
});

test('persists recharge payment orders with the locked quota package', async () => {
  const calls = [];
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 1 }];
    }
  };

  await paymentRepository.createPaymentOrder(pool, {
    orderNo: 'DPCC202605040002',
    userId: 12,
    productType: 'recharge',
    planId: 'usd-33',
    durationId: 'one_time',
    amount: '50.00',
    quotaUsd: '33.00',
    subject: 'DPCC API $33 额度包',
    expiresAt: '2026-05-04 08:05:00'
  });

  const insertCall = calls.find(([sql]) => /INSERT INTO payment_orders/.test(sql));
  assert.ok(insertCall);
  assert.match(insertCall[0], /product_type/);
  assert.match(insertCall[0], /quota_usd/);
  assert.ok(insertCall[1].includes('recharge'));
  assert.ok(insertCall[1].includes('33.00'));
});

test('verifies Alipay notification signatures', () => {
  const { privateKey, publicKey } = createKeyPair();
  const params = {
    app_id: '2026000000000001',
    out_trade_no: 'DPCC202605040001',
    trade_no: '2026050422000000001',
    trade_status: 'TRADE_SUCCESS',
    total_amount: '69.90',
    seller_id: '2088000000000000',
    sign_type: 'RSA2'
  };
  params.sign = signNotify(params, privateKey);

  assert.equal(verifyAlipayNotifyParams(params, { alipayPublicKey: publicKey }), true);

  assert.equal(
    verifyAlipayNotifyParams({ ...params, total_amount: '1.00' }, { alipayPublicKey: publicKey }),
    false
  );
});

test('loads Alipay PEM keys from external files when path env vars are set', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpcc-alipay-'));
  const privateKeyPath = path.join(tempDir, 'app_private.pem');
  const publicKeyPath = path.join(tempDir, 'alipay_public.pem');
  fs.writeFileSync(privateKeyPath, '-----BEGIN PRIVATE KEY-----\\nabc\\n-----END PRIVATE KEY-----\\n');
  fs.writeFileSync(publicKeyPath, '-----BEGIN PUBLIC KEY-----\\ndef\\n-----END PUBLIC KEY-----\\n');

  const configPath = require.resolve('../backend/config/payment');
  const previousEnv = {
    ALIPAY_PRIVATE_KEY_PATH: process.env.ALIPAY_PRIVATE_KEY_PATH,
    ALIPAY_PUBLIC_KEY_PATH: process.env.ALIPAY_PUBLIC_KEY_PATH,
    ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY
  };

  try {
    process.env.ALIPAY_PRIVATE_KEY_PATH = privateKeyPath;
    process.env.ALIPAY_PUBLIC_KEY_PATH = publicKeyPath;
    process.env.ALIPAY_PRIVATE_KEY = 'inline-private';
    process.env.ALIPAY_PUBLIC_KEY = 'inline-public';
    delete require.cache[configPath];
    const paymentConfig = require('../backend/config/payment');

    assert.equal(paymentConfig.alipay.privateKey, '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----');
    assert.equal(paymentConfig.alipay.alipayPublicKey, '-----BEGIN PUBLIC KEY-----\ndef\n-----END PUBLIC KEY-----');
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    delete require.cache[configPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('wraps raw Alipay base64 key files as PEM blocks', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dpcc-alipay-raw-'));
  const privateKeyPath = path.join(tempDir, 'app_private.txt');
  const publicKeyPath = path.join(tempDir, 'alipay_public.txt');
  fs.writeFileSync(privateKeyPath, 'abc123');
  fs.writeFileSync(publicKeyPath, 'def456');

  const configPath = require.resolve('../backend/config/payment');
  const previousEnv = {
    ALIPAY_PRIVATE_KEY_PATH: process.env.ALIPAY_PRIVATE_KEY_PATH,
    ALIPAY_PUBLIC_KEY_PATH: process.env.ALIPAY_PUBLIC_KEY_PATH
  };

  try {
    process.env.ALIPAY_PRIVATE_KEY_PATH = privateKeyPath;
    process.env.ALIPAY_PUBLIC_KEY_PATH = publicKeyPath;
    delete require.cache[configPath];
    const paymentConfig = require('../backend/config/payment');

    assert.equal(paymentConfig.alipay.privateKey, '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----');
    assert.equal(paymentConfig.alipay.alipayPublicKey, '-----BEGIN PUBLIC KEY-----\ndef456\n-----END PUBLIC KEY-----');
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    delete require.cache[configPath];
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('treats missing external key files as empty config values', () => {
  const configPath = require.resolve('../backend/config/payment');
  const previousEnv = {
    ALIPAY_PRIVATE_KEY_PATH: process.env.ALIPAY_PRIVATE_KEY_PATH,
    ALIPAY_PUBLIC_KEY_PATH: process.env.ALIPAY_PUBLIC_KEY_PATH,
    ALIPAY_PRIVATE_KEY: process.env.ALIPAY_PRIVATE_KEY,
    ALIPAY_PUBLIC_KEY: process.env.ALIPAY_PUBLIC_KEY
  };

  try {
    process.env.ALIPAY_PRIVATE_KEY_PATH = '/tmp/does-not-exist-private.pem';
    process.env.ALIPAY_PUBLIC_KEY_PATH = '/tmp/does-not-exist-public.pem';
    process.env.ALIPAY_PRIVATE_KEY = '';
    process.env.ALIPAY_PUBLIC_KEY = '';
    delete require.cache[configPath];
    const paymentConfig = require('../backend/config/payment');

    assert.equal(paymentConfig.alipay.privateKey, '');
    assert.equal(paymentConfig.alipay.alipayPublicKey, '');
  } finally {
    Object.entries(previousEnv).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
    delete require.cache[configPath];
  }
});

test('marks paid orders once and grants membership with a transaction', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push(['begin']);
    },
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (/SELECT \* FROM payment_orders/.test(sql)) {
        return [[{
          id: 7,
          user_id: 12,
          order_no: 'DPCC202605040001',
          plan_id: 'gold',
          duration_id: '1m',
          amount: '69.90',
          status: 'pending'
        }]];
      }
      if (/SELECT \* FROM user_api_memberships/.test(sql)) {
        return [[]];
      }
      return [{ affectedRows: 1 }];
    },
    async commit() {
      calls.push(['commit']);
    },
    async rollback() {
      calls.push(['rollback']);
    },
    release() {
      calls.push(['release']);
    }
  };
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 0 }];
    },
    async getConnection() {
      return connection;
    }
  };

  const result = await handlePaidOrder(pool, {
    orderNo: 'DPCC202605040001',
    alipayTradeNo: '2026050422000000001',
    totalAmount: '69.90',
    paidAt: new Date('2026-05-04T08:00:00.000Z')
  });

  assert.equal(result.status, 'paid');
  assert.ok(calls.some(([sql]) => /UPDATE payment_orders/.test(sql)));
  assert.ok(calls.some(([sql]) => /INSERT INTO user_api_memberships/.test(sql)));
  assert.deepEqual(calls.at(-2), ['commit']);
  assert.deepEqual(calls.at(-1), ['release']);
});

test('requires api username when a subscription order is paid', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push(['begin']);
    },
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (/SELECT \* FROM payment_orders/.test(sql)) {
        return [[{
          id: 7,
          user_id: 12,
          order_no: 'DPCC202605040001',
          product_type: 'subscription',
          plan_id: 'gold',
          duration_id: '1m',
          amount: '69.90',
          status: 'pending'
        }]];
      }
      if (/SELECT \* FROM user_api_memberships/.test(sql)) {
        return [[]];
      }
      return [{ affectedRows: 1 }];
    },
    async commit() {
      calls.push(['commit']);
    },
    async rollback() {
      calls.push(['rollback']);
    },
    release() {
      calls.push(['release']);
    }
  };
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 0 }];
    },
    async getConnection() {
      return connection;
    }
  };

  const result = await handlePaidOrder(pool, {
    orderNo: 'DPCC202605040001',
    alipayTradeNo: '2026050422000000001',
    totalAmount: '69.90',
    paidAt: new Date('2026-05-04T08:00:00.000Z')
  });

  assert.equal(result.fulfillmentStatus, 'username_required');
  assert.equal(result.redeemCode, null);
  assert.equal(result.supportWechat, '15160701051');
  assert.equal(result.redeemUrl, '');
  assert.equal(calls.some(([sql]) => /UPDATE redeem_codes/.test(sql)), false);
  assert.ok(calls.some(([sql, params]) => /UPDATE payment_orders/.test(sql) && params.includes('15160701051')));
  assert.deepEqual(calls.at(-2), ['commit']);
  assert.deepEqual(calls.at(-1), ['release']);
});

test('keeps paid subscription successful without redeem code inventory', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push(['begin']);
    },
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (/SELECT \* FROM payment_orders/.test(sql)) {
        return [[{
          id: 7,
          user_id: 12,
          order_no: 'DPCC202605040001',
          product_type: 'subscription',
          plan_id: 'gold',
          duration_id: '1m',
          amount: '69.90',
          status: 'pending'
        }]];
      }
      if (/SELECT \* FROM user_api_memberships/.test(sql)) {
        return [[]];
      }
      return [{ affectedRows: 1 }];
    },
    async commit() {
      calls.push(['commit']);
    },
    async rollback() {
      calls.push(['rollback']);
    },
    release() {
      calls.push(['release']);
    }
  };
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 0 }];
    },
    async getConnection() {
      return connection;
    }
  };

  const result = await handlePaidOrder(pool, {
    orderNo: 'DPCC202605040001',
    alipayTradeNo: '2026050422000000001',
    totalAmount: '69.90',
    paidAt: new Date('2026-05-04T08:00:00.000Z')
  });

  assert.equal(result.status, 'paid');
  assert.equal(result.redeemCode, null);
  assert.equal(result.fulfillmentStatus, 'username_required');
  assert.ok(calls.some(([sql, params]) => /UPDATE payment_orders/.test(sql) && params.includes('15160701051')));
  assert.equal(calls.some(([sql]) => /UPDATE redeem_codes/.test(sql)), false);
  assert.deepEqual(calls.at(-2), ['commit']);
  assert.deepEqual(calls.at(-1), ['release']);
});

test('marks paid recharge orders once and adds user balance with a transaction', async () => {
  const calls = [];
  const connection = {
    async beginTransaction() {
      calls.push(['begin']);
    },
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (/SELECT \* FROM payment_orders/.test(sql)) {
        return [[{
          id: 8,
          user_id: 12,
          order_no: 'DPCC202605040002',
          product_type: 'recharge',
          plan_id: 'usd-33',
          duration_id: 'one_time',
          amount: '50.00',
          quota_usd: '33.00',
          status: 'pending'
        }]];
      }
      return [{ affectedRows: 1 }];
    },
    async commit() {
      calls.push(['commit']);
    },
    async rollback() {
      calls.push(['rollback']);
    },
    release() {
      calls.push(['release']);
    }
  };
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 0 }];
    },
    async getConnection() {
      return connection;
    }
  };

  const result = await handlePaidOrder(pool, {
    orderNo: 'DPCC202605040002',
    alipayTradeNo: '2026050422000000002',
    totalAmount: '50.00',
    paidAt: new Date('2026-05-04T08:00:00.000Z')
  });

  assert.equal(result.status, 'paid');
  assert.equal(result.productType, 'recharge');
  assert.ok(calls.some(([sql]) => /UPDATE payment_orders/.test(sql)));
  assert.ok(calls.some(([sql]) => /user_api_balances/.test(sql)));
  assert.equal(calls.some(([sql]) => /user_api_memberships/.test(sql)), false);
  assert.deepEqual(calls.at(-2), ['commit']);
  assert.deepEqual(calls.at(-1), ['release']);
});

test('does not grant membership when a duplicate callback loses the pending update', async () => {
  const calls = [];
  let orderSelectCount = 0;
  const connection = {
    async beginTransaction() {
      calls.push(['begin']);
    },
    async execute(sql, params = []) {
      calls.push([sql, params]);
      if (/SELECT \* FROM payment_orders/.test(sql)) {
        orderSelectCount += 1;
        return [[{
          id: 7,
          user_id: 12,
          order_no: 'DPCC202605040001',
          plan_id: 'gold',
          duration_id: '1m',
          amount: '69.90',
          status: orderSelectCount > 1 ? 'paid' : 'pending'
        }]];
      }
      if (/UPDATE payment_orders/.test(sql)) {
        return [{ affectedRows: 0 }];
      }
      throw new Error(`Unexpected SQL after duplicate update: ${sql}`);
    },
    async commit() {
      calls.push(['commit']);
    },
    async rollback() {
      calls.push(['rollback']);
    },
    release() {
      calls.push(['release']);
    }
  };
  const pool = {
    async execute(sql, params = []) {
      calls.push([sql, params]);
      return [{ affectedRows: 0 }];
    },
    async getConnection() {
      return connection;
    }
  };

  const result = await handlePaidOrder(pool, {
    orderNo: 'DPCC202605040001',
    alipayTradeNo: '2026050422000000001',
    totalAmount: '69.90',
    paidAt: new Date('2026-05-04T08:00:00.000Z')
  });

  assert.deepEqual(result, {
    status: 'paid',
    orderNo: 'DPCC202605040001',
    alreadyPaid: true
  });
  assert.ok(calls.some(([sql]) => /UPDATE payment_orders/.test(sql)));
  assert.equal(calls.some(([sql]) => /user_api_memberships/.test(sql)), false);
  assert.deepEqual(calls.at(-2), ['commit']);
  assert.deepEqual(calls.at(-1), ['release']);
});
