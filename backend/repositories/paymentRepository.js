const { toMysqlDateTime } = require('../services/payment/paymentUtils');
const { parseSnapshotJson } = require('../services/payment/paymentProductUtils');
const { getRechargeBonusPackage } = require('../services/payment/plans');
const {
  encryptRedeemCode,
  getRedeemCodeLookupHash,
  normalizeCode
} = require('../services/payment/redeemCodeCrypto');

let paymentTablesInitPromise = null;

const decimalOrDefault = (value, fallback = '0.00') => (
  value === null || value === undefined ? fallback : value
);

const normalizeOptionalDateTime = (value) => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(date.getTime()) ? toMysqlDateTime(date) : null;
};

const hasEncryptedRedeemCodeColumns = (row = {}) => Boolean(
  row.code_ciphertext
  && row.code_iv
  && row.code_auth_tag
);

const parseOrderProductSnapshot = (order = {}) => parseSnapshotJson(order.product_snapshot_json) || {};

const resolveOrderRedeemSku = (order = {}, kind = 'main') => {
  const snapshot = parseOrderProductSnapshot(order);
  if (kind === 'bonus') {
    return snapshot.bonusRedeemSkuId || getRechargeBonusPackage().id;
  }
  if (order.product_type === 'recharge') {
    return snapshot.mainRedeemSkuId || order.plan_id;
  }
  return order.plan_id;
};

const findRedeemCodeBySecretForUpdate = async (executor, code = '') => {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;
  const lookupHash = getRedeemCodeLookupHash(normalizedCode);
  const [rows] = await executor.execute(
    `
      SELECT *
      FROM redeem_codes
      WHERE code_lookup_hash = ? OR code = ?
      LIMIT 1
      FOR UPDATE
    `,
    [lookupHash, normalizedCode]
  );
  return rows[0] || null;
};

const createAssignedRedeemCodeFromSecret = async (executor, payload = {}) => {
  const encrypted = encryptRedeemCode(payload.code);
  await executor.execute(
    `
      INSERT IGNORE INTO redeem_codes
        (
          product_type, sku_id, code, code_ciphertext, code_iv, code_auth_tag,
          code_lookup_hash, status, assigned_order_no, assigned_user_id, assigned_at
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'assigned', ?, ?, ?)
    `,
    [
      payload.productType,
      payload.skuId,
      encrypted.codeStorageValue,
      encrypted.codeCiphertext,
      encrypted.codeIv,
      encrypted.codeAuthTag,
      encrypted.codeLookupHash,
      payload.orderNo,
      payload.userId,
      payload.assignedAt
    ]
  );
  return findRedeemCodeBySecretForUpdate(executor, payload.code);
};

const assignRedeemCodeRowToLegacyOrder = async (executor, row = {}, order = {}) => {
  if (!row?.id || row.status !== 'available') return;
  await executor.execute(
    `
      UPDATE redeem_codes
      SET status = 'assigned',
          assigned_order_no = ?,
          assigned_user_id = ?,
          assigned_at = COALESCE(?, NOW())
      WHERE id = ? AND status = 'available'
    `,
    [order.order_no, order.user_id, order.paid_at || order.updated_at || null, row.id]
  );
};

const ensureLegacyOrderRedeemCodeReference = async (executor, order = {}, kind = 'main') => {
  const codeField = kind === 'bonus' ? 'bonus_redeem_code' : 'redeem_code';
  const idField = kind === 'bonus' ? 'bonus_redeem_code_id' : 'redeem_code_id';
  const plainCode = normalizeCode(order[codeField]);
  if (!plainCode) return order[idField] || null;
  if (order[idField]) return order[idField];

  let codeRow = await findRedeemCodeBySecretForUpdate(executor, plainCode);
  if (!codeRow) {
    codeRow = await createAssignedRedeemCodeFromSecret(executor, {
      productType: kind === 'bonus' ? 'recharge' : (order.product_type || 'subscription'),
      skuId: resolveOrderRedeemSku(order, kind),
      code: plainCode,
      orderNo: order.order_no,
      userId: order.user_id,
      assignedAt: order.paid_at || order.updated_at || null
    });
  } else {
    await assignRedeemCodeRowToLegacyOrder(executor, codeRow, order);
  }

  return codeRow?.id || null;
};

const migrateLegacyPaymentOrderRedeemCodes = async (connection) => {
  const [orders] = await connection.execute(
    `
      SELECT *
      FROM payment_orders
      WHERE (redeem_code IS NOT NULL AND redeem_code <> '')
         OR (bonus_redeem_code IS NOT NULL AND bonus_redeem_code <> '')
      LIMIT 1000
      FOR UPDATE
    `
  );

  for (const order of orders) {
    const redeemCodeId = await ensureLegacyOrderRedeemCodeReference(connection, order, 'main');
    const bonusRedeemCodeId = await ensureLegacyOrderRedeemCodeReference(connection, order, 'bonus');
    await connection.execute(
      `
        UPDATE payment_orders
        SET redeem_code_id = COALESCE(?, redeem_code_id),
            bonus_redeem_code_id = COALESCE(?, bonus_redeem_code_id),
            redeem_code = NULL,
            bonus_redeem_code = NULL
        WHERE id = ?
      `,
      [redeemCodeId, bonusRedeemCodeId, order.id]
    );
  }

  return orders.length;
};

const migrateLegacyRedeemCodeRows = async (connection) => {
  const [rows] = await connection.execute(
    `
      SELECT *
      FROM redeem_codes
      WHERE (
          code_ciphertext IS NULL
          OR code_ciphertext = ''
          OR code_iv IS NULL
          OR code_auth_tag IS NULL
        )
        AND code NOT LIKE 'enc:v1:%'
      LIMIT 1000
      FOR UPDATE
    `
  );

  for (const row of rows) {
    if (hasEncryptedRedeemCodeColumns(row) || String(row.code || '').startsWith('enc:v1:')) continue;
    const encrypted = encryptRedeemCode(row.code);
    await connection.execute(
      `
        UPDATE redeem_codes
        SET code = ?,
            code_ciphertext = ?,
            code_iv = ?,
            code_auth_tag = ?,
            code_lookup_hash = ?
        WHERE id = ?
      `,
      [
        encrypted.codeStorageValue,
        encrypted.codeCiphertext,
        encrypted.codeIv,
        encrypted.codeAuthTag,
        encrypted.codeLookupHash,
        row.id
      ]
    );
  }

  return rows.length;
};

const migrateLegacyRedeemCodeStorage = async (pool) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let migratedOrders = 0;
    let migratedCodes = 0;
    do {
      migratedOrders = await migrateLegacyPaymentOrderRedeemCodes(connection);
    } while (migratedOrders === 1000);
    do {
      migratedCodes = await migrateLegacyRedeemCodeRows(connection);
    } while (migratedCodes === 1000);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

const ensurePaymentTables = async (pool) => {
  if (!paymentTablesInitPromise) {
    paymentTablesInitPromise = (async () => {
      await Promise.all([
        pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_orders (
          id INT AUTO_INCREMENT PRIMARY KEY,
          order_no VARCHAR(64) NOT NULL UNIQUE,
          user_id INT NOT NULL,
          provider VARCHAR(24) NOT NULL DEFAULT 'alipay',
          product_type VARCHAR(24) NOT NULL DEFAULT 'subscription',
          plan_id VARCHAR(32) NOT NULL,
          duration_id VARCHAR(32) NOT NULL,
          quota_usd DECIMAL(10,2) DEFAULT NULL,
          amount DECIMAL(10,2) NOT NULL,
          currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
          subject VARCHAR(128) NOT NULL,
          status ENUM('pending', 'paid', 'closed') NOT NULL DEFAULT 'pending',
          alipay_trade_no VARCHAR(96) DEFAULT NULL,
          alipay_buyer_id VARCHAR(128) DEFAULT NULL,
          paid_at DATETIME DEFAULT NULL,
          expires_at DATETIME DEFAULT NULL,
          fulfillment_status VARCHAR(24) NOT NULL DEFAULT 'pending',
          redeem_code_id INT DEFAULT NULL,
          bonus_redeem_code_id INT DEFAULT NULL,
          redeem_code VARCHAR(128) DEFAULT NULL,
          bonus_redeem_code VARCHAR(128) DEFAULT NULL,
          redeem_url VARCHAR(255) DEFAULT NULL,
          support_wechat VARCHAR(32) DEFAULT NULL,
          support_note VARCHAR(255) DEFAULT NULL,
          api_username VARCHAR(96) DEFAULT NULL,
          product_snapshot_json TEXT,
          promotion_snapshot_json TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_payment_orders_user_id (user_id),
          INDEX idx_payment_orders_status (status),
          UNIQUE INDEX uq_payment_orders_alipay_trade_no (alipay_trade_no),
          INDEX idx_payment_orders_alipay_buyer_id (alipay_buyer_id),
          INDEX idx_payment_orders_redeem_code_id (redeem_code_id),
          INDEX idx_payment_orders_bonus_redeem_code_id (bonus_redeem_code_id),
          CONSTRAINT fk_payment_orders_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS user_api_memberships (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          plan_id VARCHAR(32) NOT NULL,
          daily_quota_usd DECIMAL(10,2) NOT NULL,
          starts_at DATETIME NOT NULL,
          expires_at DATETIME NOT NULL,
          last_order_no VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_user_api_memberships_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS user_api_balances (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL UNIQUE,
          balance_usd DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          last_order_no VARCHAR(64) DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          CONSTRAINT fk_user_api_balances_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_bonus_claims (
          id INT AUTO_INCREMENT PRIMARY KEY,
          claim_type VARCHAR(24) NOT NULL,
          claim_key VARCHAR(320) NOT NULL,
          order_no VARCHAR(64) NOT NULL,
          user_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_payment_bonus_claims_type_key (claim_type, claim_key),
          INDEX idx_payment_bonus_claims_order_no (order_no),
          INDEX idx_payment_bonus_claims_user_id (user_id)
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS redeem_codes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_type VARCHAR(24) NOT NULL,
          sku_id VARCHAR(32) NOT NULL,
          code VARCHAR(128) NOT NULL UNIQUE,
          code_ciphertext TEXT,
          code_iv VARCHAR(32) DEFAULT NULL,
          code_auth_tag VARCHAR(32) DEFAULT NULL,
          code_lookup_hash VARCHAR(64) DEFAULT NULL,
          status ENUM('available', 'assigned') NOT NULL DEFAULT 'available',
          assigned_order_no VARCHAR(64) DEFAULT NULL,
          assigned_user_id INT DEFAULT NULL,
          assigned_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_redeem_codes_lookup_hash (code_lookup_hash),
          INDEX idx_redeem_codes_sku_status (product_type, sku_id, status),
          INDEX idx_redeem_codes_order_no (assigned_order_no)
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_products (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_type VARCHAR(24) NOT NULL,
          sku_id VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(96) NOT NULL,
          subject VARCHAR(128) NOT NULL,
          description VARCHAR(255) DEFAULT NULL,
          base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          currency VARCHAR(8) NOT NULL DEFAULT 'CNY',
          base_quota_usd DECIMAL(10,2) DEFAULT NULL,
          daily_quota_usd DECIMAL(10,2) DEFAULT NULL,
          main_redeem_sku_id VARCHAR(64) DEFAULT NULL,
          bonus_redeem_sku_id VARCHAR(64) DEFAULT NULL,
          bonus_quota_usd DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          recommended TINYINT(1) NOT NULL DEFAULT 0,
          card_badge VARCHAR(64) DEFAULT NULL,
          card_features_json TEXT,
          order_note VARCHAR(255) DEFAULT NULL,
          sort_order INT NOT NULL DEFAULT 0,
          status ENUM('active','inactive') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_payment_products_type_status_sort (product_type, status, sort_order)
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_promotions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_id INT NOT NULL,
          title VARCHAR(96) NOT NULL,
          badge_text VARCHAR(64) DEFAULT NULL,
          starts_at DATETIME DEFAULT NULL,
          ends_at DATETIME DEFAULT NULL,
          promotion_price DECIMAL(10,2) DEFAULT NULL,
          promotion_bonus_quota_usd DECIMAL(10,2) NOT NULL DEFAULT 0.00,
          limit_once TINYINT(1) NOT NULL DEFAULT 0,
          limit_scope VARCHAR(24) NOT NULL DEFAULT 'user',
          claim_scope_key VARCHAR(128) DEFAULT NULL,
          status ENUM('active','inactive') NOT NULL DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_payment_promotions_product_status_time (product_id, status, starts_at, ends_at),
          CONSTRAINT fk_payment_promotions_product_id FOREIGN KEY (product_id) REFERENCES payment_products(id) ON DELETE CASCADE
        )
      `),
        pool.execute(`
        CREATE TABLE IF NOT EXISTS payment_notifications (
          id INT AUTO_INCREMENT PRIMARY KEY,
          provider VARCHAR(24) NOT NULL DEFAULT 'alipay',
          notify_id VARCHAR(128) NOT NULL,
          order_no VARCHAR(64) DEFAULT NULL,
          trade_no VARCHAR(96) DEFAULT NULL,
          status VARCHAR(24) NOT NULL DEFAULT 'processing',
          error_message VARCHAR(255) DEFAULT NULL,
          notified_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          UNIQUE KEY uq_payment_notifications_provider_notify (provider, notify_id),
          INDEX idx_payment_notifications_order_no (order_no),
          INDEX idx_payment_notifications_status (status)
        )
      `),
      ]);

      await pool.execute('ALTER TABLE payment_orders ADD COLUMN expires_at DATETIME DEFAULT NULL')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute("ALTER TABLE payment_orders ADD COLUMN product_type VARCHAR(24) NOT NULL DEFAULT 'subscription' AFTER provider")
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders MODIFY COLUMN plan_id VARCHAR(64) NOT NULL')
        .catch((error) => {
          if (error?.code === 'ER_BAD_FIELD_ERROR') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN quota_usd DECIMAL(10,2) DEFAULT NULL AFTER duration_id')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute("ALTER TABLE payment_orders ADD COLUMN fulfillment_status VARCHAR(24) NOT NULL DEFAULT 'pending' AFTER expires_at")
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN redeem_code_id INT DEFAULT NULL AFTER fulfillment_status')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN bonus_redeem_code_id INT DEFAULT NULL AFTER redeem_code_id')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN redeem_code VARCHAR(128) DEFAULT NULL AFTER fulfillment_status')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN bonus_redeem_code VARCHAR(128) DEFAULT NULL AFTER redeem_code')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN redeem_url VARCHAR(255) DEFAULT NULL AFTER redeem_code')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN support_wechat VARCHAR(32) DEFAULT NULL AFTER redeem_url')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN support_note VARCHAR(255) DEFAULT NULL AFTER support_wechat')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN api_username VARCHAR(96) DEFAULT NULL AFTER support_note')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN product_snapshot_json TEXT AFTER api_username')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN promotion_snapshot_json TEXT AFTER product_snapshot_json')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN alipay_buyer_id VARCHAR(128) DEFAULT NULL AFTER alipay_trade_no')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders MODIFY COLUMN alipay_buyer_id VARCHAR(128) DEFAULT NULL')
        .catch((error) => {
          if (error?.code === 'ER_BAD_FIELD_ERROR') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD UNIQUE INDEX uq_payment_orders_alipay_trade_no (alipay_trade_no)')
        .catch((error) => {
          if (error?.code === 'ER_DUP_KEYNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD INDEX idx_payment_orders_alipay_buyer_id (alipay_buyer_id)')
        .catch((error) => {
          if (error?.code === 'ER_DUP_KEYNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD INDEX idx_payment_orders_redeem_code_id (redeem_code_id)')
        .catch((error) => {
          if (error?.code === 'ER_DUP_KEYNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_orders ADD INDEX idx_payment_orders_bonus_redeem_code_id (bonus_redeem_code_id)')
        .catch((error) => {
          if (error?.code === 'ER_DUP_KEYNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes ADD COLUMN code_ciphertext TEXT AFTER code')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes MODIFY COLUMN sku_id VARCHAR(64) NOT NULL')
        .catch((error) => {
          if (error?.code === 'ER_BAD_FIELD_ERROR') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes ADD COLUMN code_iv VARCHAR(32) DEFAULT NULL AFTER code_ciphertext')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes ADD COLUMN code_auth_tag VARCHAR(32) DEFAULT NULL AFTER code_iv')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes ADD COLUMN code_lookup_hash VARCHAR(64) DEFAULT NULL AFTER code_auth_tag')
        .catch((error) => {
          if (error?.code === 'ER_DUP_FIELDNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes ADD UNIQUE INDEX uq_redeem_codes_lookup_hash (code_lookup_hash)')
        .catch((error) => {
          if (error?.code === 'ER_DUP_KEYNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE redeem_codes ADD INDEX idx_redeem_codes_assigned_user_sku (assigned_user_id, product_type, sku_id, status)')
        .catch((error) => {
          if (error?.code === 'ER_DUP_KEYNAME') return null;
          throw error;
        });
      await pool.execute('ALTER TABLE payment_bonus_claims MODIFY COLUMN claim_key VARCHAR(320) NOT NULL')
        .catch((error) => {
          if (error?.code === 'ER_BAD_FIELD_ERROR') return null;
          throw error;
        });
      await migrateLegacyRedeemCodeStorage(pool);
    })().catch((error) => {
      paymentTablesInitPromise = null;
      throw error;
    });
  }

  await paymentTablesInitPromise;
};

const listPaymentProducts = async (executor, filters = {}) => {
  const where = [];
  const params = [];
  if (filters.productType) {
    where.push('product_type = ?');
    params.push(filters.productType);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }
  if (filters.keyword) {
    where.push('(name LIKE ? OR sku_id LIKE ?)');
    params.push(`%${filters.keyword}%`, `%${filters.keyword}%`);
  }

  const [rows] = await executor.execute(
    `
      SELECT *
      FROM payment_products
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY sort_order ASC, id ASC
    `,
    params
  );
  return rows;
};

const getPaymentProductById = async (executor, id) => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_products WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
};

const getPaymentProductBySkuId = async (executor, skuId = '') => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_products WHERE sku_id = ? LIMIT 1',
    [skuId]
  );
  return rows[0] || null;
};

const createPaymentProduct = async (executor, product = {}) => executor.execute(
  `
    INSERT INTO payment_products
      (
        product_type, sku_id, name, subject, description, base_price,
        currency, base_quota_usd, daily_quota_usd, main_redeem_sku_id,
        bonus_redeem_sku_id, bonus_quota_usd, recommended, card_badge,
        card_features_json, order_note, sort_order, status
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    product.productType,
    product.skuId,
    product.name,
    product.subject,
    product.description || null,
    product.basePrice,
    product.currency || 'CNY',
    product.baseQuotaUsd || null,
    product.dailyQuotaUsd || null,
    product.mainRedeemSkuId || null,
    product.bonusRedeemSkuId || null,
    product.bonusQuotaUsd || '0.00',
    product.recommended ? 1 : 0,
    product.cardBadge || null,
    product.cardFeaturesJson || null,
    product.orderNote || null,
    product.sortOrder || 0,
    product.status === 'inactive' ? 'inactive' : 'active'
  ]
);

const updatePaymentProduct = async (executor, product = {}) => executor.execute(
  `
    UPDATE payment_products
    SET product_type = ?,
        name = ?,
        subject = ?,
        description = ?,
        base_price = ?,
        currency = ?,
        base_quota_usd = ?,
        daily_quota_usd = ?,
        main_redeem_sku_id = ?,
        bonus_redeem_sku_id = ?,
        bonus_quota_usd = ?,
        recommended = ?,
        card_badge = ?,
        card_features_json = ?,
        order_note = ?,
        sort_order = ?,
        status = ?
    WHERE id = ?
  `,
  [
    product.productType,
    product.name,
    product.subject,
    product.description || null,
    product.basePrice,
    product.currency || 'CNY',
    product.baseQuotaUsd || null,
    product.dailyQuotaUsd || null,
    product.mainRedeemSkuId || null,
    product.bonusRedeemSkuId || null,
    product.bonusQuotaUsd || '0.00',
    product.recommended ? 1 : 0,
    product.cardBadge || null,
    product.cardFeaturesJson || null,
    product.orderNote || null,
    product.sortOrder || 0,
    product.status === 'inactive' ? 'inactive' : 'active',
    product.id
  ]
);

const listPaymentPromotions = async (executor, filters = {}) => {
  const where = [];
  const params = [];
  if (filters.productId) {
    where.push('product_id = ?');
    params.push(filters.productId);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }

  const [rows] = await executor.execute(
    `
      SELECT *
      FROM payment_promotions
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id DESC
    `,
    params
  );
  return rows;
};

const getPaymentPromotionById = async (executor, id) => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_promotions WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
};

const getActivePaymentPromotionsForProduct = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    `
      SELECT *
      FROM payment_promotions
      WHERE product_id = ?
        AND status = 'active'
        AND (starts_at IS NULL OR starts_at <= ?)
        AND (ends_at IS NULL OR ends_at >= ?)
      ORDER BY id DESC
    `,
    [payload.productId, payload.now, payload.now]
  );
  return rows;
};

const createPaymentPromotion = async (executor, promotion = {}) => executor.execute(
  `
    INSERT INTO payment_promotions
      (
        product_id, title, badge_text, starts_at, ends_at, promotion_price,
        promotion_bonus_quota_usd, limit_once, limit_scope, claim_scope_key, status
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  [
    promotion.productId,
    promotion.title,
    promotion.badgeText || null,
    normalizeOptionalDateTime(promotion.startsAt),
    normalizeOptionalDateTime(promotion.endsAt),
    promotion.promotionPrice === null || promotion.promotionPrice === undefined ? null : promotion.promotionPrice,
    decimalOrDefault(promotion.promotionBonusQuotaUsd),
    promotion.limitOnce ? 1 : 0,
    promotion.limitScope || 'user',
    promotion.claimScopeKey || null,
    promotion.status === 'inactive' ? 'inactive' : 'active'
  ]
);

const updatePaymentPromotion = async (executor, promotion = {}) => executor.execute(
  `
    UPDATE payment_promotions
    SET title = ?,
        badge_text = ?,
        starts_at = ?,
        ends_at = ?,
        promotion_price = ?,
        promotion_bonus_quota_usd = ?,
        limit_once = ?,
        limit_scope = ?,
        claim_scope_key = ?,
        status = ?
    WHERE id = ?
  `,
  [
    promotion.title,
    promotion.badgeText || null,
    normalizeOptionalDateTime(promotion.startsAt),
    normalizeOptionalDateTime(promotion.endsAt),
    promotion.promotionPrice === null || promotion.promotionPrice === undefined ? null : promotion.promotionPrice,
    decimalOrDefault(promotion.promotionBonusQuotaUsd),
    promotion.limitOnce ? 1 : 0,
    promotion.limitScope || 'user',
    promotion.claimScopeKey || null,
    promotion.status === 'inactive' ? 'inactive' : 'active',
    promotion.id
  ]
);

const createPaymentOrder = async (pool, order = {}) => {
  await ensurePaymentTables(pool);
  await pool.execute(
    `
      INSERT INTO payment_orders
        (
          order_no, user_id, provider, product_type, plan_id, duration_id,
          quota_usd, amount, currency, subject, status, expires_at,
          product_snapshot_json, promotion_snapshot_json
        )
      VALUES (?, ?, 'alipay', ?, ?, ?, ?, ?, 'CNY', ?, 'pending', ?, ?, ?)
    `,
    [
      order.orderNo,
      order.userId,
      order.productType || 'subscription',
      order.planId,
      order.durationId,
      order.quotaUsd || null,
      order.amount,
      order.subject,
      order.expiresAt,
      order.productSnapshotJson || null,
      order.promotionSnapshotJson || null
    ]
  );
};

const getPaymentOrderByNo = async (executor, orderNo = '') => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_orders WHERE order_no = ? LIMIT 1',
    [orderNo]
  );
  return rows[0] || null;
};

const getPaymentOrderDetailByNo = async (executor, orderNo = '') => {
  const [rows] = await executor.execute(
    `
      SELECT po.*, u.username, u.email
      FROM payment_orders po
      LEFT JOIN users u ON u.id = po.user_id
      WHERE po.order_no = ?
      LIMIT 1
    `,
    [orderNo]
  );
  return rows[0] || null;
};

const listPaymentOrders = async (executor, filters = {}) => {
  const where = [];
  const params = [];
  const limit = Math.max(1, Math.min(100, Number.parseInt(filters.limit, 10) || 100));
  if (filters.orderNo) {
    where.push('po.order_no LIKE ?');
    params.push(`%${filters.orderNo}%`);
  }
  if (filters.status) {
    where.push('po.status = ?');
    params.push(filters.status);
  }

  const [rows] = await executor.execute(
    `
      SELECT po.*, u.username, u.email
      FROM payment_orders po
      LEFT JOIN users u ON u.id = po.user_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY po.id DESC
      LIMIT ?
    `,
    [...params, limit]
  );
  return rows;
};

const listPaymentOrdersForUser = async (executor, payload = {}) => {
  const limit = Math.max(1, Math.min(100, Number.parseInt(payload.limit, 10) || 50));
  const [rows] = await executor.execute(
    `
      SELECT *
      FROM payment_orders
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT ?
    `,
    [payload.userId, limit]
  );
  return rows;
};

const deleteUnpaidPaymentOrder = async (executor, orderNo = '') => executor.execute(
  `
    DELETE FROM payment_orders
    WHERE order_no = ? AND status <> 'paid'
  `,
  [orderNo]
);

const closeExpiredPaymentOrders = async (executor, now = '') => executor.execute(
  `
    UPDATE payment_orders
    SET status = 'closed'
    WHERE status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at <= ?
  `,
  [now]
);

const closeExpiredPaymentOrder = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET status = 'closed'
    WHERE order_no = ?
      AND status = 'pending'
      AND expires_at IS NOT NULL
      AND expires_at <= ?
  `,
  [payload.orderNo, payload.now]
);

const reopenClosedPaymentOrder = async (executor, orderNo = '') => executor.execute(
  `
    UPDATE payment_orders
    SET status = 'pending'
    WHERE order_no = ?
      AND status = 'closed'
  `,
  [orderNo]
);

const recordPaymentMetadataOnOrder = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET alipay_trade_no = COALESCE(alipay_trade_no, ?),
        alipay_buyer_id = COALESCE(alipay_buyer_id, ?),
        paid_at = COALESCE(paid_at, ?)
    WHERE order_no = ?
  `,
  [
    payload.alipayTradeNo || null,
    payload.alipayBuyerId || null,
    payload.paidAt || null,
    payload.orderNo
  ]
);

const deletePaymentBonusClaimsByOrderNo = async (executor, orderNo = '') => executor.execute(
  `
    DELETE FROM payment_bonus_claims
    WHERE order_no = ?
  `,
  [orderNo]
);

const deletePaymentBonusClaimsForClosedOrders = async (executor) => executor.execute(
  `
    DELETE pbc
    FROM payment_bonus_claims pbc
    INNER JOIN payment_orders po ON po.order_no = pbc.order_no
    WHERE po.status = 'closed'
  `
);

const getPaymentOrderByNoForUpdate = async (executor, orderNo = '') => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_orders WHERE order_no = ? LIMIT 1 FOR UPDATE',
    [orderNo]
  );
  return rows[0] || null;
};

const getPaymentOrderByTradeNoForUpdate = async (executor, tradeNo = '') => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_orders WHERE alipay_trade_no = ? LIMIT 1 FOR UPDATE',
    [tradeNo]
  );
  return rows[0] || null;
};

const getPaymentOrderForUser = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_orders WHERE order_no = ? AND user_id = ? LIMIT 1',
    [payload.orderNo, payload.userId]
  );
  return rows[0] || null;
};

const countPendingPaymentOrdersForUser = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    `
      SELECT COUNT(*) AS count
      FROM payment_orders
      WHERE user_id = ?
        AND status = 'pending'
        AND (expires_at IS NULL OR expires_at > ?)
    `,
    [payload.userId, payload.now]
  );
  return Number(rows[0]?.count || 0);
};

const listAssignedRedeemCodeSkusForUser = async (executor, userId) => {
  const [rows] = await executor.execute(
    `
      SELECT DISTINCT product_type, sku_id
      FROM redeem_codes
      WHERE assigned_user_id = ?
        AND status = 'assigned'
    `,
    [userId]
  );
  return rows;
};

const getAssignedRedeemCodeForUserSku = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    `
      SELECT id
      FROM redeem_codes
      WHERE assigned_user_id = ?
        AND product_type = ?
        AND sku_id = ?
        AND status = 'assigned'
      LIMIT 1
    `,
    [payload.userId, payload.productType, payload.skuId]
  );
  return rows[0] || null;
};

const getBonusRedeemCodeClaimByPayer = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    `
      SELECT order_no
      FROM payment_orders
      WHERE provider = 'alipay'
        AND status = 'paid'
        AND alipay_buyer_id = ?
        AND bonus_redeem_code_id IS NOT NULL
        AND order_no <> ?
      LIMIT 1
    `,
    [payload.alipayBuyerId, payload.currentOrderNo]
  );
  return rows[0] || null;
};

const getPaymentBonusClaim = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    `
      SELECT *
      FROM payment_bonus_claims
      WHERE claim_type = ?
        AND claim_key = ?
      LIMIT 1
    `,
    [payload.claimType, payload.claimKey]
  );
  return rows[0] || null;
};

const createPaymentBonusClaim = async (executor, payload = {}) => executor.execute(
  `
    INSERT IGNORE INTO payment_bonus_claims
      (claim_type, claim_key, order_no, user_id)
    VALUES (?, ?, ?, ?)
  `,
  [
    payload.claimType,
    payload.claimKey,
    payload.orderNo,
    payload.userId
  ]
);

const deletePaymentBonusClaim = async (executor, payload = {}) => executor.execute(
  `
    DELETE FROM payment_bonus_claims
    WHERE claim_type = ?
      AND claim_key = ?
      AND order_no = ?
  `,
  [
    payload.claimType,
    payload.claimKey,
    payload.orderNo
  ]
);

const createPaymentNotification = async (executor, payload = {}) => executor.execute(
  `
    INSERT IGNORE INTO payment_notifications
      (provider, notify_id, order_no, trade_no, status, notified_at)
    VALUES (?, ?, ?, ?, 'processing', ?)
  `,
  [
    payload.provider || 'alipay',
    payload.notifyId,
    payload.orderNo || null,
    payload.tradeNo || null,
    payload.notifiedAt || null
  ]
);

const updatePaymentNotificationStatus = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_notifications
    SET status = ?,
        error_message = ?
    WHERE provider = ? AND notify_id = ?
  `,
  [
    payload.status,
    payload.errorMessage || null,
    payload.provider || 'alipay',
    payload.notifyId
  ]
);

const deletePaymentNotification = async (executor, payload = {}) => executor.execute(
  `
    DELETE FROM payment_notifications
    WHERE provider = ? AND notify_id = ?
  `,
  [
    payload.provider || 'alipay',
    payload.notifyId
  ]
);

const getMembershipByUserId = async (executor, userId) => {
  const [rows] = await executor.execute(
    'SELECT * FROM user_api_memberships WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return rows[0] || null;
};

const markOrderPaid = async (executor, order = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET status = 'paid',
        alipay_trade_no = ?,
        alipay_buyer_id = ?,
        paid_at = ?
    WHERE order_no = ?
      AND status = 'pending'
      AND (expires_at IS NULL OR expires_at >= ?)
  `,
  [order.alipayTradeNo, order.alipayBuyerId || null, order.paidAt, order.orderNo, order.paidAt]
);

const insertMembership = async (executor, membership = {}) => executor.execute(
  `
    INSERT INTO user_api_memberships
      (user_id, plan_id, daily_quota_usd, starts_at, expires_at, last_order_no)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  [
    membership.userId,
    membership.planId,
    membership.dailyQuotaUsd,
    membership.startsAt,
    membership.expiresAt,
    membership.orderNo
  ]
);

const updateMembership = async (executor, membership = {}) => executor.execute(
  `
    UPDATE user_api_memberships
    SET plan_id = ?, daily_quota_usd = ?, starts_at = ?, expires_at = ?, last_order_no = ?
    WHERE user_id = ?
  `,
  [
    membership.planId,
    membership.dailyQuotaUsd,
    membership.startsAt,
    membership.expiresAt,
    membership.orderNo,
    membership.userId
  ]
);

const addUserBalance = async (executor, balance = {}) => executor.execute(
  `
    INSERT INTO user_api_balances
      (user_id, balance_usd, last_order_no)
    VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE
      balance_usd = balance_usd + VALUES(balance_usd),
      last_order_no = VALUES(last_order_no)
  `,
  [
    balance.userId,
    balance.quotaUsd,
    balance.orderNo
  ]
);

const assignRedeemCodeToOrder = async (executor, payload = {}) => {
  const [rows] = await executor.execute(
    `
      SELECT * FROM redeem_codes
      WHERE product_type = ? AND sku_id = ? AND status = 'available'
      ORDER BY id ASC
      LIMIT 1
      FOR UPDATE
    `,
    [payload.productType, payload.skuId]
  );
  const code = rows[0] || null;
  if (!code) return null;

  const [result] = await executor.execute(
    `
      UPDATE redeem_codes
      SET status = 'assigned',
          assigned_order_no = ?,
          assigned_user_id = ?,
          assigned_at = ?
      WHERE id = ? AND status = 'available'
    `,
    [payload.orderNo, payload.userId, payload.assignedAt, code.id]
  );

  return result?.affectedRows === 1 ? code : null;
};

const updatePaymentOrderFulfillment = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET fulfillment_status = ?,
        redeem_code_id = ?,
        bonus_redeem_code_id = ?,
        redeem_code = ?,
        bonus_redeem_code = ?,
        redeem_url = ?,
        support_wechat = ?,
        support_note = ?
    WHERE order_no = ?
  `,
  [
    payload.fulfillmentStatus,
    payload.redeemCodeId || null,
    payload.bonusRedeemCodeId || null,
    payload.redeemCode || null,
    payload.bonusRedeemCode || null,
    payload.redeemUrl,
    payload.supportWechat,
    payload.supportNote,
    payload.orderNo
  ]
);

const updatePaymentOrderQuota = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET quota_usd = ?
    WHERE order_no = ?
  `,
  [
    payload.quotaUsd,
    payload.orderNo
  ]
);

const updatePaymentOrderApiUsername = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET api_username = ?,
        support_note = CASE
          WHEN fulfillment_status = 'username_required' THEN COALESCE(?, support_note)
          ELSE support_note
        END,
        fulfillment_status = CASE
          WHEN fulfillment_status = 'manual_required' THEN 'manual_required'
          ELSE 'username_submitted'
        END
    WHERE order_no = ? AND user_id = ? AND status = 'paid'
      AND api_username IS NULL
      AND fulfillment_status IN ('username_required', 'manual_required')
  `,
  [
    payload.apiUsername,
    payload.supportNote || null,
    payload.orderNo,
    payload.userId
  ]
);

const createRedeemCode = async (executor, payload = {}) => executor.execute(
  `
    INSERT IGNORE INTO redeem_codes
      (product_type, sku_id, code, code_ciphertext, code_iv, code_auth_tag, code_lookup_hash, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'available')
  `,
  [
    payload.productType,
    payload.skuId,
    payload.code,
    payload.codeCiphertext || null,
    payload.codeIv || null,
    payload.codeAuthTag || null,
    payload.codeLookupHash || null
  ]
);

const listRedeemCodes = async (executor, filters = {}) => {
  const where = [];
  const params = [];
  if (filters.productType) {
    where.push('product_type = ?');
    params.push(filters.productType);
  }
  if (filters.skuId) {
    where.push('sku_id = ?');
    params.push(filters.skuId);
  }
  if (filters.status) {
    where.push('status = ?');
    params.push(filters.status);
  }

  const [rows] = await executor.execute(
    `
      SELECT *
      FROM redeem_codes
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY id DESC
      LIMIT 300
    `,
    params
  );
  return rows;
};

const getRedeemCodeStats = async (executor) => {
  const [rows] = await executor.execute(
    `
      SELECT product_type, sku_id, status, COUNT(*) AS count
      FROM redeem_codes
      GROUP BY product_type, sku_id, status
    `
  );
  return rows;
};

const getRedeemCodeById = async (executor, id) => {
  const [rows] = await executor.execute(
    'SELECT * FROM redeem_codes WHERE id = ? LIMIT 1',
    [id]
  );
  return rows[0] || null;
};

const getRedeemCodeByLookupHash = async (executor, lookupHash = '') => {
  const [rows] = await executor.execute(
    'SELECT id FROM redeem_codes WHERE code_lookup_hash = ? LIMIT 1',
    [lookupHash]
  );
  return rows[0] || null;
};

const getRedeemCodesByIds = async (executor, ids = []) => {
  const normalizedIds = [...new Set(ids
    .map((id) => Number(id))
    .filter((id) => Number.isInteger(id) && id > 0))];
  if (!normalizedIds.length) return [];
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const [rows] = await executor.execute(
    `
      SELECT *
      FROM redeem_codes
      WHERE id IN (${placeholders})
    `,
    normalizedIds
  );
  return rows;
};

const deleteAvailableRedeemCodes = async (executor, ids = []) => {
  if (!ids.length) return [{ affectedRows: 0 }];
  const placeholders = ids.map(() => '?').join(', ');
  return executor.execute(
    `
      DELETE FROM redeem_codes
      WHERE id IN (${placeholders}) AND status = 'available'
    `,
    ids
  );
};

module.exports = {
  ensurePaymentTables,
  listPaymentProducts,
  getPaymentProductById,
  getPaymentProductBySkuId,
  createPaymentProduct,
  updatePaymentProduct,
  listPaymentPromotions,
  getPaymentPromotionById,
  getActivePaymentPromotionsForProduct,
  createPaymentPromotion,
  updatePaymentPromotion,
  createPaymentOrder,
  getPaymentOrderByNo,
  getPaymentOrderDetailByNo,
  listPaymentOrders,
  listPaymentOrdersForUser,
  deleteUnpaidPaymentOrder,
  closeExpiredPaymentOrders,
  closeExpiredPaymentOrder,
  reopenClosedPaymentOrder,
  recordPaymentMetadataOnOrder,
  deletePaymentBonusClaimsByOrderNo,
  deletePaymentBonusClaimsForClosedOrders,
  getPaymentOrderByNoForUpdate,
  getPaymentOrderByTradeNoForUpdate,
  getPaymentOrderForUser,
  countPendingPaymentOrdersForUser,
  listAssignedRedeemCodeSkusForUser,
  getAssignedRedeemCodeForUserSku,
  getBonusRedeemCodeClaimByPayer,
  getPaymentBonusClaim,
  createPaymentBonusClaim,
  deletePaymentBonusClaim,
  createPaymentNotification,
  updatePaymentNotificationStatus,
  deletePaymentNotification,
  getMembershipByUserId,
  markOrderPaid,
  insertMembership,
  updateMembership,
  addUserBalance,
  assignRedeemCodeToOrder,
  updatePaymentOrderFulfillment,
  updatePaymentOrderQuota,
  updatePaymentOrderApiUsername,
  createRedeemCode,
  listRedeemCodes,
  getRedeemCodeStats,
  getRedeemCodeById,
  getRedeemCodeByLookupHash,
  getRedeemCodesByIds,
  deleteAvailableRedeemCodes
};
