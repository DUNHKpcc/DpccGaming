const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const paymentService = require('./paymentService');
const paymentConfig = require('../../config/payment');
const repository = require('../../repositories/paymentRepository');
const { buildSignContent } = require('./alipay');

const originalRepository = {};
const originalAlipayConfig = { ...paymentConfig.alipay };
const originalNodeEnv = process.env.NODE_ENV;

const stubRepository = (overrides) => {
  for (const [key, value] of Object.entries(overrides)) {
    if (!Object.prototype.hasOwnProperty.call(originalRepository, key)) {
      originalRepository[key] = repository[key];
    }
    repository[key] = value;
  }
};

test.afterEach(() => {
  for (const [key, value] of Object.entries(originalRepository)) {
    repository[key] = value;
  }
  Object.keys(paymentConfig.alipay).forEach((key) => {
    delete paymentConfig.alipay[key];
  });
  Object.assign(paymentConfig.alipay, originalAlipayConfig);
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

const createConnection = () => ({
  beginTransaction: async () => {},
  commit: async () => {},
  rollback: async () => {},
  release: () => {}
});

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

const signNotify = (params, privateKey) => crypto
  .createSign('RSA-SHA256')
  .update(buildSignContent(params, { excludeSignType: true }), 'utf8')
  .sign(privateKey, 'base64');

test('creating Alipay orders requires the public key used for callbacks', async () => {
  paymentConfig.alipay.appId = '2026000000000001';
  paymentConfig.alipay.privateKey = 'configured-private-key';
  paymentConfig.alipay.gatewayUrl = 'https://openapi.alipay.com/gateway.do';
  paymentConfig.alipay.alipayPublicKey = '';

  await assert.rejects(
    paymentService.createAlipayOrder({
      userId: 7,
      productType: 'subscription',
      planId: 'bronze',
      durationId: '1m'
    }),
    /ALIPAY_PUBLIC_KEY/
  );
});

test('production Alipay orders require a public HTTPS notify URL', async () => {
  process.env.NODE_ENV = 'production';
  paymentConfig.alipay.appId = '2026000000000001';
  paymentConfig.alipay.privateKey = 'configured-private-key';
  paymentConfig.alipay.alipayPublicKey = 'configured-public-key';
  paymentConfig.alipay.sellerId = '2088000000000000';
  paymentConfig.alipay.gatewayUrl = 'https://openapi.alipay.com/gateway.do';
  paymentConfig.alipay.notifyUrl = 'http://localhost:3000/api/payments/alipay/notify';

  await assert.rejects(
    paymentService.createAlipayOrder({
      userId: 7,
      productType: 'subscription',
      planId: 'bronze',
      durationId: '1m'
    }),
    /ALIPAY_NOTIFY_URL/
  );
});

test('Alipay notifications reject mismatched seller id when configured', async () => {
  const { privateKey, publicKey } = createKeyPair();
  paymentConfig.alipay.appId = '2026000000000001';
  paymentConfig.alipay.alipayPublicKey = publicKey;
  paymentConfig.alipay.sellerId = '2088000000000000';

  const params = {
    app_id: '2026000000000001',
    out_trade_no: 'DPCCORDERSELLER',
    trade_no: '2026050622000000001',
    trade_status: 'WAIT_BUYER_PAY',
    total_amount: '29.90',
    seller_id: '2088000000000001',
    sign_type: 'RSA2'
  };
  params.sign = signNotify(params, privateKey);

  await assert.rejects(
    paymentService.handleAlipayNotify(params),
    /SELLER_ID/
  );
});

test('parses Alipay gmt_payment as paid time when present', () => {
  const paidAt = paymentService.parseAlipayPaymentDate('2026-05-06 14:15:16');

  assert.equal(paymentService.toMysqlDateTime(paidAt), '2026-05-06 14:15:16');
});

test('paid subscription orders require api username instead of redeem code', async () => {
  const calls = {
    assignRedeemCodeToOrder: 0,
    fulfillment: null
  };
  const connection = createConnection();

  stubRepository({
    ensurePaymentTables: async () => {},
    getPaymentOrderByNoForUpdate: async () => ({
      order_no: 'DPCCORDER1',
      user_id: 7,
      product_type: 'subscription',
      plan_id: 'bronze',
      duration_id: '1m',
      amount: '29.90',
      status: 'pending'
    }),
    markOrderPaid: async () => [{ affectedRows: 1 }],
    assignRedeemCodeToOrder: async () => {
      calls.assignRedeemCodeToOrder += 1;
      return { code: 'SHOULD-NOT-BE-USED' };
    },
    updatePaymentOrderFulfillment: async (executor, payload) => {
      calls.fulfillment = payload;
    },
    getMembershipByUserId: async () => null,
    insertMembership: async () => {},
    updateMembership: async () => {}
  });

  const result = await paymentService.handlePaidOrder({
    getConnection: async () => connection
  }, {
    orderNo: 'DPCCORDER1',
    alipayTradeNo: 'ALI1',
    totalAmount: '29.90',
    paidAt: new Date('2026-05-06T00:00:00Z')
  });

  assert.equal(calls.assignRedeemCodeToOrder, 0);
  assert.equal(calls.fulfillment.fulfillmentStatus, 'username_required');
  assert.equal(calls.fulfillment.redeemCode, null);
  assert.equal(result.fulfillmentStatus, 'username_required');
  assert.equal(result.redeemCode, null);
});

test('api username submission is saved on paid subscription orders', async () => {
  const calls = {
    apiUsername: null
  };
  const pool = {};

  stubRepository({
    ensurePaymentTables: async () => {},
    getPaymentOrderForUser: async () => ({
      order_no: 'DPCCORDER2',
      user_id: 7,
      product_type: 'subscription',
      plan_id: 'gold',
      duration_id: '1m',
      amount: '69.90',
      status: 'paid'
    }),
    updatePaymentOrderApiUsername: async (executor, payload) => {
      calls.apiUsername = payload.apiUsername;
      return [{ affectedRows: 1 }];
    }
  });

  const result = await paymentService.submitPaymentOrderApiUsername({
    userId: 7,
    orderNo: 'DPCCORDER2',
    apiUsername: '  dpcc-api-user  '
  }, pool);

  assert.equal(calls.apiUsername, 'dpcc-api-user');
  assert.equal(result.apiUsername, 'dpcc-api-user');
  assert.equal(result.fulfillmentStatus, 'username_submitted');
});

test('api username submission cannot overwrite an existing username', async () => {
  const pool = {};

  stubRepository({
    ensurePaymentTables: async () => {},
    getPaymentOrderForUser: async () => ({
      order_no: 'DPCCORDER3',
      user_id: 7,
      product_type: 'subscription',
      plan_id: 'gold',
      duration_id: '1m',
      amount: '69.90',
      status: 'paid',
      api_username: 'existing-user',
      fulfillment_status: 'username_submitted'
    }),
    updatePaymentOrderApiUsername: async () => {
      throw new Error('update should not be called');
    }
  });

  await assert.rejects(
    paymentService.submitPaymentOrderApiUsername({
      userId: 7,
      orderNo: 'DPCCORDER3',
      apiUsername: 'new-user'
    }, pool),
    /已经提交/
  );
});

test('api username update is constrained to one pending username submission', async () => {
  const calls = [];
  const executor = {
    execute: async (sql, params) => {
      calls.push([sql, params]);
      return [{ affectedRows: 1 }];
    }
  };

  await repository.updatePaymentOrderApiUsername(executor, {
    orderNo: 'DPCCORDER4',
    userId: 7,
    apiUsername: 'dpcc-api-user'
  });

  assert.match(calls[0][0], /api_username IS NULL/);
  assert.match(calls[0][0], /fulfillment_status = 'username_required'/);
});

test('deletes one available redeem code by id', async () => {
  const pool = {};
  const calls = {
    ids: null
  };

  stubRepository({
    ensurePaymentTables: async () => {},
    deleteAvailableRedeemCodes: async (executor, ids) => {
      calls.ids = ids;
      return [{ affectedRows: 1 }];
    }
  });

  const result = await paymentService.deleteRedeemCode({ id: 7 }, pool);

  assert.deepEqual(calls.ids, [7]);
  assert.deepEqual(result, {
    requested: 1,
    deleted: 1,
    skipped: 0
  });
});

test('single redeem code delete rejects assigned or missing codes', async () => {
  const pool = {};

  stubRepository({
    ensurePaymentTables: async () => {},
    deleteAvailableRedeemCodes: async () => [{ affectedRows: 0 }]
  });

  await assert.rejects(
    paymentService.deleteRedeemCode({ id: 8 }, pool),
    /不存在或已分配/
  );
});

test('batch redeem code delete reports skipped assigned codes', async () => {
  const pool = {};
  const calls = {
    ids: null
  };

  stubRepository({
    ensurePaymentTables: async () => {},
    deleteAvailableRedeemCodes: async (executor, ids) => {
      calls.ids = ids;
      return [{ affectedRows: 2 }];
    }
  });

  const result = await paymentService.deleteRedeemCodes({ ids: [11, '12', 13] }, pool);

  assert.deepEqual(calls.ids, [11, 12, 13]);
  assert.deepEqual(result, {
    requested: 3,
    deleted: 2,
    skipped: 1
  });
});

test('redeem code deletion is constrained to available codes', async () => {
  const calls = [];
  const executor = {
    execute: async (sql, params) => {
      calls.push([sql, params]);
      return [{ affectedRows: 2 }];
    }
  };

  await repository.deleteAvailableRedeemCodes(executor, [1, 2]);

  assert.match(calls[0][0], /DELETE FROM redeem_codes/);
  assert.match(calls[0][0], /status = 'available'/);
  assert.deepEqual(calls[0][1], [1, 2]);
});

test('closed orders are not acknowledged as already paid when pending update fails', async () => {
  const connection = createConnection();

  stubRepository({
    ensurePaymentTables: async () => {},
    getPaymentOrderByNoForUpdate: async () => ({
      order_no: 'DPCCCLOSED',
      user_id: 7,
      product_type: 'subscription',
      plan_id: 'bronze',
      duration_id: '1m',
      amount: '29.90',
      status: 'closed'
    }),
    markOrderPaid: async () => [{ affectedRows: 0 }]
  });

  await assert.rejects(
    paymentService.handlePaidOrder({
      getConnection: async () => connection
    }, {
      orderNo: 'DPCCCLOSED',
      alipayTradeNo: 'ALI-CLOSED',
      totalAmount: '29.90',
      paidAt: new Date('2026-05-06T00:00:00Z')
    }),
    /不是待支付状态/
  );
});
