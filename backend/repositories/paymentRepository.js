let paymentTablesInitPromise = null;

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
          paid_at DATETIME DEFAULT NULL,
          expires_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_payment_orders_user_id (user_id),
          INDEX idx_payment_orders_status (status),
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
        CREATE TABLE IF NOT EXISTS redeem_codes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          product_type VARCHAR(24) NOT NULL,
          sku_id VARCHAR(32) NOT NULL,
          code VARCHAR(128) NOT NULL UNIQUE,
          status ENUM('available', 'assigned') NOT NULL DEFAULT 'available',
          assigned_order_no VARCHAR(64) DEFAULT NULL,
          assigned_user_id INT DEFAULT NULL,
          assigned_at DATETIME DEFAULT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_redeem_codes_sku_status (product_type, sku_id, status),
          INDEX idx_redeem_codes_order_no (assigned_order_no)
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
      await pool.execute('ALTER TABLE payment_orders ADD COLUMN redeem_code VARCHAR(128) DEFAULT NULL AFTER fulfillment_status')
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
    })().catch((error) => {
      paymentTablesInitPromise = null;
      throw error;
    });
  }

  await paymentTablesInitPromise;
};

const createPaymentOrder = async (pool, order = {}) => {
  await ensurePaymentTables(pool);
  await pool.execute(
    `
      INSERT INTO payment_orders
        (order_no, user_id, provider, product_type, plan_id, duration_id, quota_usd, amount, currency, subject, status, expires_at)
      VALUES (?, ?, 'alipay', ?, ?, ?, ?, ?, 'CNY', ?, 'pending', ?)
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
      order.expiresAt
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

const getPaymentOrderByNoForUpdate = async (executor, orderNo = '') => {
  const [rows] = await executor.execute(
    'SELECT * FROM payment_orders WHERE order_no = ? LIMIT 1 FOR UPDATE',
    [orderNo]
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
    SET status = 'paid', alipay_trade_no = ?, paid_at = ?
    WHERE order_no = ? AND status = 'pending'
  `,
  [order.alipayTradeNo, order.paidAt, order.orderNo]
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
        redeem_code = ?,
        redeem_url = ?,
        support_wechat = ?,
        support_note = ?
    WHERE order_no = ?
  `,
  [
    payload.fulfillmentStatus,
    payload.redeemCode || null,
    payload.redeemUrl,
    payload.supportWechat,
    payload.supportNote,
    payload.orderNo
  ]
);

const updatePaymentOrderApiUsername = async (executor, payload = {}) => executor.execute(
  `
    UPDATE payment_orders
    SET api_username = ?,
        fulfillment_status = 'username_submitted'
    WHERE order_no = ? AND user_id = ? AND status = 'paid'
      AND api_username IS NULL
      AND fulfillment_status = 'username_required'
  `,
  [
    payload.apiUsername,
    payload.orderNo,
    payload.userId
  ]
);

const createRedeemCode = async (executor, payload = {}) => executor.execute(
  `
    INSERT IGNORE INTO redeem_codes
      (product_type, sku_id, code, status)
    VALUES (?, ?, ?, 'available')
  `,
  [payload.productType, payload.skuId, payload.code]
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
  createPaymentOrder,
  getPaymentOrderByNo,
  getPaymentOrderByNoForUpdate,
  getPaymentOrderForUser,
  getMembershipByUserId,
  markOrderPaid,
  insertMembership,
  updateMembership,
  addUserBalance,
  assignRedeemCodeToOrder,
  updatePaymentOrderFulfillment,
  updatePaymentOrderApiUsername,
  createRedeemCode,
  listRedeemCodes,
  getRedeemCodeStats,
  deleteAvailableRedeemCodes
};
