# Payment Products Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build admin-configurable subscription and recharge products with promotion rules, order snapshots, and reused one-time claim logic.

**Architecture:** Add database-backed payment products and promotions while keeping `paymentService.js` as the controller-facing facade. Centralize effective product calculation in `paymentProductService`, then make order creation, catalog display, fulfillment, and admin UI consume the same normalized product data. Preserve static `plans.js` data as seed and fallback data.

**Tech Stack:** Node.js, Express, MySQL via `mysql2`, Vue 3 Composition API, Element Plus, existing payment service modules, existing admin routes and audit log utilities.

---

## File Structure

- Modify `backend/repositories/paymentRepository.js`: create/alter product, promotion, and snapshot tables/columns; add product, promotion, snapshot, and scoped claim queries.
- Modify `backend/services/payment/plans.js`: keep fixed durations and static default/fallback product definitions; expose default product seed rows instead of being the only runtime source.
- Create `backend/services/payment/paymentProductUtils.js`: pure normalization helpers for money, quotas, JSON feature lists, time windows, and effective price/quota calculations.
- Create `backend/services/payment/paymentClaimService.js`: reusable claim acquisition/release helpers for bonus code and promotion user-limit claims.
- Create `backend/services/payment/paymentProductService.js`: public catalog, admin CRUD, promotion management, seeding, effective product resolution, and order snapshot building.
- Modify `backend/services/payment/paymentCatalogService.js`: delegate catalog building to `paymentProductService`.
- Modify `backend/services/payment/alipayOrderService.js`: create orders by `productId`, not hard-coded plan/package lookup; write snapshots.
- Modify `backend/services/payment/paymentFulfillmentService.js`: fulfill from order snapshots and reusable claim helpers.
- Modify `backend/services/payment/paymentOrderQueryService.js`: display products from snapshots with legacy fallback.
- Modify `backend/services/payment/redeemCodeService.js`: validate redeem SKU against dynamic products plus static fallback.
- Modify `backend/services/payment/paymentService.js`: export new admin product functions through the existing facade.
- Create `backend/controllers/adminPaymentProductController.js`: admin JSON handlers and audit logging.
- Modify `backend/routes/admin.js`: add super-admin product routes.
- Create `src/admin/views/PaymentProductManagement.vue`: Element Plus admin page for product and promotion management.
- Modify `src/admin/layout/AdminLayout.vue`: add payment products menu entry.
- Modify `src/router/index.js`: add `/admin/payment-products`.
- Modify `src/views/Payment.vue`: render catalog-driven products and submit `productId`.
- Optional temporary tests under `temp-test/`: use Node scripts with fake repositories/objects, then delete before completion.

## Task 1: Repository Schema And Query Primitives

**Files:**
- Modify: `backend/repositories/paymentRepository.js`

- [ ] **Step 1: Add schema creation for product tables**

In `ensurePaymentTables`, add `CREATE TABLE IF NOT EXISTS payment_products` and `payment_promotions` to the existing `Promise.all`.

Use this schema shape:

```sql
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
```

```sql
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
```

- [ ] **Step 2: Add snapshot columns to `payment_orders`**

Add columns to the create-table statement:

```sql
product_snapshot_json TEXT,
promotion_snapshot_json TEXT,
```

Add matching `ALTER TABLE` migrations:

```js
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
```

- [ ] **Step 3: Add repository methods for product reads and writes**

Add functions with these names and signatures:

```js
const listPaymentProducts = async (executor, filters = {}) => {};
const getPaymentProductById = async (executor, id) => {};
const getPaymentProductBySkuId = async (executor, skuId = '') => {};
const createPaymentProduct = async (executor, product = {}) => {};
const updatePaymentProduct = async (executor, product = {}) => {};
```

Implementation requirements:

- `listPaymentProducts` accepts `productType`, `status`, and `keyword`.
- Order by `sort_order ASC, id ASC`.
- Use parameterized SQL only.
- `updatePaymentProduct` must not update `sku_id`.
- `createPaymentProduct` inserts all editable product columns listed in Task 1 Step 1.
- `updatePaymentProduct` updates all editable product columns except `sku_id`, `created_at`, and `updated_at`.

- [ ] **Step 4: Add repository methods for promotions**

Add functions:

```js
const listPaymentPromotions = async (executor, filters = {}) => {};
const getPaymentPromotionById = async (executor, id) => {};
const getActivePaymentPromotionsForProduct = async (executor, payload = {}) => {};
const createPaymentPromotion = async (executor, promotion = {}) => {};
const updatePaymentPromotion = async (executor, promotion = {}) => {};
```

`getActivePaymentPromotionsForProduct` should use:

```sql
WHERE product_id = ?
  AND status = 'active'
  AND (starts_at IS NULL OR starts_at <= ?)
  AND (ends_at IS NULL OR ends_at >= ?)
ORDER BY id DESC
```

- [ ] **Step 5: Update order creation query for snapshots**

Change `createPaymentOrder` so the insert includes `product_snapshot_json` and `promotion_snapshot_json`.

Use values:

```js
order.productSnapshotJson || null,
order.promotionSnapshotJson || null
```

- [ ] **Step 6: Export all new repository functions**

Add each new repository function to `module.exports`.

- [ ] **Step 7: Verify syntax**

Run:

```bash
node --check backend/repositories/paymentRepository.js
```

Expected: command exits 0.

- [ ] **Step 8: Commit**

```bash
git add backend/repositories/paymentRepository.js
git commit -m "feat(payment): add product schema primitives"
```

## Task 2: Static Defaults And Product Utilities

**Files:**
- Modify: `backend/services/payment/plans.js`
- Create: `backend/services/payment/paymentProductUtils.js`

- [ ] **Step 1: Extend static defaults in `plans.js`**

Keep existing exports working. Add exports:

```js
const listDefaultPaymentProducts = () => [
  ...PAYMENT_PLANS.map((plan, index) => ({
    productType: 'subscription',
    skuId: plan.id,
    name: plan.name,
    subject: plan.subject,
    description: '',
    basePrice: plan.price,
    currency: 'CNY',
    baseQuotaUsd: plan.bonusQuotaUsd,
    dailyQuotaUsd: plan.dailyQuotaUsd,
    mainRedeemSkuId: '',
    bonusRedeemSkuId: RECHARGE_BONUS_PACKAGE.id,
    bonusQuotaUsd: plan.bonusQuotaUsd,
    recommended: plan.id === 'gold',
    cardBadge: plan.id === 'gold' ? '推荐款项' : '',
    cardFeatures: plan.id === 'bronze'
      ? ['✅适合轻量试用', '🎉每日凌晨自动重制额度', '⚠️额度用完后按余额扣费', '💰月等值150$']
      : plan.id === 'gold'
        ? ['✅适合日常编码', '🎉每日凌晨自动重制额度', '⚠️额度用完后按余额扣费', '💰月等值450$']
        : ['✅适合高频调用', '🎉每日凌晨自动重制额度', '⚠️额度用完后按余额扣费', '💰月等值1500$'],
    orderNote: '',
    sortOrder: index + 10,
    status: 'active'
  })),
  ...RECHARGE_PACKAGES.map((pack, index) => ({
    productType: 'recharge',
    skuId: pack.id,
    name: pack.name,
    subject: pack.subject,
    description: '',
    basePrice: pack.price,
    currency: 'CNY',
    baseQuotaUsd: pack.originalQuotaUsd || pack.quotaUsd,
    dailyQuotaUsd: null,
    mainRedeemSkuId: pack.id,
    bonusRedeemSkuId: RECHARGE_BONUS_PACKAGE.id,
    bonusQuotaUsd: RECHARGE_BONUS_PACKAGE.quotaUsd,
    recommended: false,
    cardBadge: '',
    cardFeatures: ['✅到账余额 · ⚡调用扣费', '🔒服务端锁定金额和额度'],
    orderNote: '',
    sortOrder: index + 10,
    status: 'active'
  }))
];
```

Export `listDefaultPaymentProducts`.

- [ ] **Step 2: Create `paymentProductUtils.js`**

Create the file with pure helpers:

```js
const normalizeMoney = (value, fallback = '0.00') => {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : fallback;
};

const normalizeQuota = (value, fallback = '0.00') => normalizeMoney(value, fallback);

const toCents = (value) => Math.round(Number(value || 0) * 100);

const fromCents = (value) => (Number(value || 0) / 100).toFixed(2);

const normalizeProductType = (value = '') => (value === 'recharge' ? 'recharge' : 'subscription');

const parseJsonArray = (value, fallback = []) => {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map((item) => String(item || '').trim()).filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
};

const stringifyJsonArray = (value = []) => JSON.stringify(parseJsonArray(value));

const parseSnapshotJson = (value) => {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
};

const isPromotionActive = (promotion = {}, now = new Date()) => {
  if (!promotion || promotion.status !== 'active') return false;
  const time = now.getTime();
  const startsAt = promotion.starts_at || promotion.startsAt;
  const endsAt = promotion.ends_at || promotion.endsAt;
  const start = startsAt ? new Date(startsAt).getTime() : null;
  const end = endsAt ? new Date(endsAt).getTime() : null;
  if (start && Number.isFinite(start) && time < start) return false;
  if (end && Number.isFinite(end) && time > end) return false;
  return true;
};

const resolveEffectiveProduct = (product = {}, promotion = null) => {
  const activePromotion = promotion && isPromotionActive(promotion) ? promotion : null;
  const basePrice = normalizeMoney(product.base_price ?? product.basePrice);
  const promotionPrice = activePromotion?.promotion_price ?? activePromotion?.promotionPrice;
  const displayPrice = activePromotion && promotionPrice !== null && promotionPrice !== undefined
    ? normalizeMoney(promotionPrice, basePrice)
    : basePrice;
  const baseQuotaUsd = normalizeQuota(product.base_quota_usd ?? product.baseQuotaUsd);
  const bonusQuotaUsd = activePromotion
    ? normalizeQuota(activePromotion.promotion_bonus_quota_usd ?? activePromotion.promotionBonusQuotaUsd ?? product.bonus_quota_usd ?? product.bonusQuotaUsd)
    : normalizeQuota(product.bonus_quota_usd ?? product.bonusQuotaUsd);
  return {
    basePrice,
    displayPrice,
    baseQuotaUsd,
    bonusQuotaUsd,
    activePromotion
  };
};

module.exports = {
  normalizeMoney,
  normalizeQuota,
  toCents,
  fromCents,
  normalizeProductType,
  parseJsonArray,
  stringifyJsonArray,
  parseSnapshotJson,
  isPromotionActive,
  resolveEffectiveProduct
};
```

- [ ] **Step 3: Verify syntax**

Run:

```bash
node --check backend/services/payment/plans.js
node --check backend/services/payment/paymentProductUtils.js
```

Expected: both commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/services/payment/plans.js backend/services/payment/paymentProductUtils.js
git commit -m "feat(payment): add product defaults and helpers"
```

## Task 3: Claim Helper Service

**Files:**
- Create: `backend/services/payment/paymentClaimService.js`
- Modify: `backend/services/payment/paymentFulfillmentService.js`

- [ ] **Step 1: Extract reusable claim helpers**

Create `paymentClaimService.js`:

```js
const repository = require('../../repositories/paymentRepository');

const createClaim = async (executor, payload = {}) => {
  const [result] = await repository.createPaymentBonusClaim(executor, {
    claimType: payload.claimType,
    claimKey: payload.claimKey,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  return Number(result?.affectedRows || 0) === 1;
};

const releaseClaim = (executor, payload = {}) => {
  if (!payload.claimType || !payload.claimKey) return Promise.resolve();
  return repository.deletePaymentBonusClaim(executor, {
    claimType: payload.claimType,
    claimKey: payload.claimKey,
    orderNo: payload.orderNo
  });
};

const releaseClaims = async (executor, payload = {}) => {
  const claims = Array.isArray(payload.claims) ? payload.claims : [];
  for (const claim of claims) {
    await releaseClaim(executor, { ...claim, orderNo: payload.orderNo });
  }
};

const buildScopedClaim = (purpose = '', scope = '', key = '') => ({
  claimType: `${String(purpose || '').trim()}_${String(scope || '').trim()}`.slice(0, 24),
  claimKey: String(key || '').trim()
});

const acquireUserClaim = async (executor, payload = {}) => {
  const claim = buildScopedClaim(payload.purpose || 'bonus', 'user', payload.userId);
  if (!claim.claimKey || claim.claimKey === '0') return { claimed: false, reason: 'user_missing' };
  const claimed = await createClaim(executor, {
    ...claim,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  return claimed ? { claimed: true, claims: [claim] } : { claimed: false, reason: 'already_used' };
};

const acquireUserAndPayerClaims = async (executor, payload = {}) => {
  const userResult = await acquireUserClaim(executor, payload);
  if (!userResult.claimed) return userResult;

  const buyerId = String(payload.alipayBuyerId || '').trim();
  if (!buyerId) {
    await releaseClaims(executor, { orderNo: payload.orderNo, claims: userResult.claims });
    return { claimed: false, reason: 'payer_missing' };
  }

  const payerClaim = buildScopedClaim(payload.purpose || 'bonus', 'alipay_buyer', buyerId);
  const payerClaimed = await createClaim(executor, {
    ...payerClaim,
    orderNo: payload.orderNo,
    userId: payload.userId
  });
  if (!payerClaimed) {
    await releaseClaims(executor, { orderNo: payload.orderNo, claims: userResult.claims });
    return { claimed: false, reason: 'already_used' };
  }

  return { claimed: true, claims: [...userResult.claims, payerClaim] };
};

module.exports = {
  createClaim,
  releaseClaim,
  releaseClaims,
  buildScopedClaim,
  acquireUserClaim,
  acquireUserAndPayerClaims
};
```

- [ ] **Step 2: Replace local claim functions in fulfillment**

In `paymentFulfillmentService.js`, import:

```js
const {
  acquireUserAndPayerClaims,
  releaseClaims
} = require('./paymentClaimService');
```

Remove local `createBonusClaim`, `releaseBonusClaim`, `createBonusClaims`, and `releaseBonusClaims`.

In `assignBonusRedeemCode`, replace `createBonusClaims(...)` with:

```js
const claim = await acquireUserAndPayerClaims(connection, {
  purpose: 'bonus',
  alipayBuyerId: options.alipayBuyerId,
  orderNo: order.order_no,
  userId: order.user_id
});
```

When assignment fails, call the imported `releaseClaims`.

- [ ] **Step 3: Verify syntax**

Run:

```bash
node --check backend/services/payment/paymentClaimService.js
node --check backend/services/payment/paymentFulfillmentService.js
```

Expected: both commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add backend/services/payment/paymentClaimService.js backend/services/payment/paymentFulfillmentService.js
git commit -m "refactor(payment): extract reusable claim service"
```

## Task 4: Product Service And Catalog

**Files:**
- Create: `backend/services/payment/paymentProductService.js`
- Modify: `backend/services/payment/paymentCatalogService.js`
- Modify: `backend/services/payment/paymentService.js`

- [ ] **Step 1: Create product service skeleton with seeding**

Create `paymentProductService.js` with:

```js
const { getPool } = require('../../config/database');
const repository = require('../../repositories/paymentRepository');
const {
  listDefaultPaymentProducts,
  listPaymentDurations,
  getRechargeBonusPackage
} = require('./plans');
const {
  normalizeMoney,
  normalizeQuota,
  normalizeProductType,
  parseJsonArray,
  stringifyJsonArray,
  resolveEffectiveProduct
} = require('./paymentProductUtils');
const { acquireUserClaim, releaseClaims } = require('./paymentClaimService');

const toDbProduct = (product = {}) => ({
  productType: normalizeProductType(product.productType),
  skuId: String(product.skuId || '').trim(),
  name: String(product.name || '').trim(),
  subject: String(product.subject || product.name || '').trim(),
  description: String(product.description || '').trim(),
  basePrice: normalizeMoney(product.basePrice),
  currency: String(product.currency || 'CNY').trim(),
  baseQuotaUsd: product.baseQuotaUsd === null ? null : normalizeQuota(product.baseQuotaUsd),
  dailyQuotaUsd: product.dailyQuotaUsd === null ? null : normalizeQuota(product.dailyQuotaUsd),
  mainRedeemSkuId: String(product.mainRedeemSkuId || '').trim(),
  bonusRedeemSkuId: String(product.bonusRedeemSkuId || '').trim(),
  bonusQuotaUsd: normalizeQuota(product.bonusQuotaUsd),
  recommended: product.recommended ? 1 : 0,
  cardBadge: String(product.cardBadge || '').trim(),
  cardFeaturesJson: stringifyJsonArray(product.cardFeatures),
  orderNote: String(product.orderNote || '').trim(),
  sortOrder: Number.isInteger(Number(product.sortOrder)) ? Number(product.sortOrder) : 0,
  status: product.status === 'inactive' ? 'inactive' : 'active'
});

const seedDefaultPaymentProducts = async (pool = getPool()) => {
  await repository.ensurePaymentTables(pool);
  const existing = await repository.listPaymentProducts(pool, {});
  if (existing.length > 0) return { seeded: 0 };
  let seeded = 0;
  for (const product of listDefaultPaymentProducts()) {
    const [result] = await repository.createPaymentProduct(pool, toDbProduct(product));
    seeded += Number(result?.affectedRows || 0);
  }
  return { seeded };
};
```

- [ ] **Step 2: Add product validation**

Add `validateProductInput(product, options)`:

```js
const validateProductInput = (product = {}, options = {}) => {
  if (!product.skuId && options.requireSku !== false) throw Object.assign(new Error('商品 SKU 不能为空'), { statusCode: 400 });
  if (!product.name) throw Object.assign(new Error('商品名称不能为空'), { statusCode: 400 });
  if (!product.subject) throw Object.assign(new Error('支付宝商品标题不能为空'), { statusCode: 400 });
  if (Number(product.basePrice) < 0) throw Object.assign(new Error('商品金额不能小于 0'), { statusCode: 400 });
  if (product.productType === 'subscription' && Number(product.dailyQuotaUsd || 0) <= 0) {
    throw Object.assign(new Error('月卡每日额度必须大于 0'), { statusCode: 400 });
  }
  if (product.productType === 'recharge' && Number(product.baseQuotaUsd || 0) <= 0) {
    throw Object.assign(new Error('充值到账额度必须大于 0'), { statusCode: 400 });
  }
};
```

- [ ] **Step 3: Add product mappers and public catalog**

Add:

```js
const mapProductRow = (row = {}, promotions = []) => {
  const promotion = promotions[0] || null;
  const effective = resolveEffectiveProduct(row, promotion);
  return {
    id: row.id,
    productType: row.product_type,
    skuId: row.sku_id,
    name: row.name,
    subject: row.subject,
    description: row.description || '',
    price: effective.displayPrice,
    basePrice: normalizeMoney(row.base_price),
    originalPrice: normalizeMoney(row.base_price),
    currency: row.currency || 'CNY',
    baseQuotaUsd: row.base_quota_usd,
    quotaUsd: row.product_type === 'recharge'
      ? (Number(effective.baseQuotaUsd) + Number(effective.bonusQuotaUsd)).toFixed(2)
      : row.base_quota_usd,
    dailyQuotaUsd: row.daily_quota_usd,
    mainRedeemSkuId: row.main_redeem_sku_id || '',
    bonusRedeemSkuId: row.bonus_redeem_sku_id || '',
    bonusQuotaUsd: effective.bonusQuotaUsd,
    recommended: Boolean(row.recommended),
    cardBadge: row.card_badge || '',
    features: parseJsonArray(row.card_features_json),
    orderNote: row.order_note || '',
    sortOrder: Number(row.sort_order || 0),
    status: row.status,
    activePromotion: promotion ? {
      id: promotion.id,
      title: promotion.title,
      badgeText: promotion.badge_text || '',
      promotionPrice: promotion.promotion_price,
      promotionBonusQuotaUsd: promotion.promotion_bonus_quota_usd,
      limitOnce: Boolean(promotion.limit_once)
    } : null
  };
};
```

Add `getCatalog(options, pool)` that:

1. Calls `seedDefaultPaymentProducts`.
2. Reads active products.
3. Reads active promotions for each product.
4. Attaches inventory stats from `repository.getRedeemCodeStats`.
5. Returns `subscriptionProducts`, `rechargeProducts`, `plans`, `rechargePackages`, `durations`, and `bonusRedeemCodeStock`.

Keep `plans` alias equal to `subscriptionProducts` and `rechargePackages` alias equal to `rechargeProducts` for frontend migration safety.

- [ ] **Step 4: Add admin product functions**

Add exports:

```js
const listAdminPaymentProducts = async (filters = {}, pool = getPool()) => {};
const createAdminPaymentProduct = async (payload = {}, pool = getPool()) => {};
const updateAdminPaymentProduct = async (payload = {}, pool = getPool()) => {};
const copyAdminPaymentProduct = async ({ id } = {}, pool = getPool()) => {};
```

For copy SKU suffix, use:

```js
const copiedSku = `${source.sku_id}-copy-${Date.now().toString(36)}`;
```

- [ ] **Step 5: Add promotion functions**

Add exports:

```js
const createAdminPaymentPromotion = async (payload = {}, pool = getPool()) => {};
const updateAdminPaymentPromotion = async (payload = {}, pool = getPool()) => {};
```

Validation must reject an active promotion if another active promotion on the same product overlaps its time window.

- [ ] **Step 6: Add order snapshot builder**

Add:

```js
const buildOrderProductSnapshot = async ({ productId, durationId, userId } = {}, pool = getPool()) => {
  await seedDefaultPaymentProducts(pool);
  const product = await repository.getPaymentProductById(pool, Number(productId));
  if (!product || product.status !== 'active') throw Object.assign(new Error('支付款项无效'), { statusCode: 400 });
  const promotions = await repository.getActivePaymentPromotionsForProduct(pool, {
    productId: product.id,
    now: require('./paymentUtils').toMysqlDateTime(new Date())
  });
  const mapped = mapProductRow(product, promotions);
  return {
    product: mapped,
    durationId: mapped.productType === 'subscription' ? String(durationId || '1m') : 'one_time',
    productSnapshotJson: JSON.stringify(mapped),
    promotionSnapshotJson: mapped.activePromotion ? JSON.stringify(mapped.activePromotion) : null
  };
};
```

The implementation should validate fixed duration with `getPaymentDuration`.

- [ ] **Step 7: Delegate catalog service**

Replace `paymentCatalogService.getCatalog` internals with:

```js
const { getCatalog } = require('./paymentProductService');
```

Keep `getRedeemCodeCatalog` in `paymentCatalogService` unless a later task moves it.

- [ ] **Step 8: Export through facade**

In `paymentService.js`, import and export:

```js
listAdminPaymentProducts,
createAdminPaymentProduct,
updateAdminPaymentProduct,
copyAdminPaymentProduct,
createAdminPaymentPromotion,
updateAdminPaymentPromotion
```

- [ ] **Step 9: Verify syntax**

Run:

```bash
node --check backend/services/payment/paymentProductService.js
node --check backend/services/payment/paymentCatalogService.js
node --check backend/services/payment/paymentService.js
```

Expected: all commands exit 0.

- [ ] **Step 10: Commit**

```bash
git add backend/services/payment/paymentProductService.js backend/services/payment/paymentCatalogService.js backend/services/payment/paymentService.js
git commit -m "feat(payment): add dynamic product catalog service"
```

## Task 5: Order Creation With Product Snapshots

**Files:**
- Modify: `backend/services/payment/alipayOrderService.js`
- Modify: `backend/services/payment/paymentOrderQueryService.js`

- [ ] **Step 1: Accept `productId` in Alipay order creation**

Change `createAlipayOrder` signature to:

```js
const createAlipayOrder = async ({ userId, productType = 'subscription', productId, planId, durationId, rechargePackageId } = {}) => {
```

Use legacy fallback:

```js
const requestedProductId = productId || planId || rechargePackageId;
```

Then call:

```js
const {
  product,
  duration,
  productSnapshotJson,
  promotionSnapshotJson
} = await paymentProductService.buildOrderProductSnapshot({
  productId: requestedProductId,
  durationId,
  userId
}, pool);
```

The implementation may support legacy SKU IDs by adding a `buildOrderProductSnapshotByProductOrSku` helper if current frontend still sends `planId`.

- [ ] **Step 2: Build order from snapshot**

Replace hard-coded plan/package amount construction with:

```js
const amount = product.price;
const order = {
  orderNo: createOrderNo(),
  userId,
  productType: product.productType,
  planId: product.skuId,
  durationId: product.productType === 'recharge' ? 'one_time' : duration.id,
  quotaUsd: product.productType === 'recharge' ? product.quotaUsd : product.bonusQuotaUsd,
  amount,
  subject: product.subject,
  body: product.productType === 'recharge'
    ? `一次性充值 ${product.quotaUsd} 美元额度`
    : `${duration.label}，赠送 ${product.bonusQuotaUsd} 美元普通余额`,
  expiresAt: toMysqlDateTime(expiresAt),
  expiresInMinutes: PAYMENT_ORDER_LOCK_MINUTES,
  productSnapshotJson,
  promotionSnapshotJson
};
```

For subscription duration pricing, multiply `product.price` by `duration.months` using cent arithmetic from `paymentProductUtils`.

- [ ] **Step 3: Query order display from snapshot**

In `paymentOrderQueryService.js`, import `parseSnapshotJson`.

Update `resolvePaymentProductName`:

```js
const snapshot = parseSnapshotJson(order.product_snapshot_json);
if (snapshot?.name) {
  return {
    productType: snapshot.productType || order.product_type,
    productName: snapshot.name
  };
}
```

Keep current legacy lookup after that.

- [ ] **Step 4: Include snapshot in admin detail response**

Add to `mapAdminPaymentOrder`:

```js
productSnapshot: parseSnapshotJson(order.product_snapshot_json),
promotionSnapshot: parseSnapshotJson(order.promotion_snapshot_json),
```

- [ ] **Step 5: Verify syntax**

Run:

```bash
node --check backend/services/payment/alipayOrderService.js
node --check backend/services/payment/paymentOrderQueryService.js
```

Expected: both commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add backend/services/payment/alipayOrderService.js backend/services/payment/paymentOrderQueryService.js
git commit -m "feat(payment): create orders from product snapshots"
```

## Task 6: Fulfillment From Dynamic Snapshot

**Files:**
- Modify: `backend/services/payment/paymentFulfillmentService.js`
- Modify: `backend/services/payment/redeemCodeService.js`

- [ ] **Step 1: Parse product snapshots in fulfillment**

Import:

```js
const { parseSnapshotJson } = require('./paymentProductUtils');
```

Add helper:

```js
const getOrderProductSnapshot = (order = {}) => parseSnapshotJson(order.product_snapshot_json) || {
  productType: order.product_type,
  skuId: order.plan_id,
  bonusRedeemSkuId: getRechargeBonusPackage().id,
  bonusQuotaUsd: order.quota_usd
};
```

- [ ] **Step 2: Make bonus assignment accept dynamic bonus SKU**

Change `assignBonusRedeemCode` to read:

```js
const snapshot = getOrderProductSnapshot(order);
const bonusSkuId = snapshot.bonusRedeemSkuId || getRechargeBonusPackage().id;
```

Use `bonusSkuId` in `hasUserRedeemedSku` and `assignRedeemCodeToOrder`.

- [ ] **Step 3: Make primary recharge assignment use snapshot main SKU**

In `assignPaymentFulfillment`, set:

```js
const snapshot = getOrderProductSnapshot(order);
const skuId = productType === 'recharge'
  ? (snapshot.mainRedeemSkuId || order.plan_id)
  : order.plan_id;
```

- [ ] **Step 4: Keep repeated callback idempotency**

Do not change the existing early return:

```js
if (order.status === 'paid') {
  await connection.commit();
  transactionClosed = true;
  return { status: 'paid', orderNo: order.order_no, alreadyPaid: true };
}
```

- [ ] **Step 5: Update redeem-code SKU validation**

In `redeemCodeService.normalizeRedeemProduct`, allow dynamic product SKUs by checking `paymentProductService.getRedeemCodeCatalog` or a new service helper. Keep static fallback for current products.

Validation rule:

```js
if dynamic SKU exists in mainRedeemSkuId, bonusRedeemSkuId, or product skuId, accept it.
```

- [ ] **Step 6: Verify syntax**

Run:

```bash
node --check backend/services/payment/paymentFulfillmentService.js
node --check backend/services/payment/redeemCodeService.js
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add backend/services/payment/paymentFulfillmentService.js backend/services/payment/redeemCodeService.js
git commit -m "feat(payment): fulfill orders from product snapshots"
```

## Task 7: Admin Product API

**Files:**
- Create: `backend/controllers/adminPaymentProductController.js`
- Modify: `backend/routes/admin.js`

- [ ] **Step 1: Create controller**

Create controller with handlers:

```js
const paymentService = require('../services/payment/paymentService');
const { getPool } = require('../config/database');
const { recordAdminAuditLog } = require('../utils/adminAudit');

const buildAuditContext = (req) => ({
  adminUserId: req.user?.userId || null,
  ipAddress: req.ip || req.connection?.remoteAddress || '',
  userAgent: req.headers?.['user-agent'] || ''
});

const listProducts = async (req, res) => {
  try {
    const result = await paymentService.listAdminPaymentProducts(req.query || {});
    res.json(result);
  } catch (error) {
    console.error('获取支付档位失败:', error);
    res.status(error.statusCode || 500).json({ message: error.message || '获取支付档位失败' });
  }
};

const createProduct = async (req, res) => {
  try {
    const result = await paymentService.createAdminPaymentProduct(req.body || {});
    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'payment_products.create',
      resourceType: 'payment_product',
      resourceId: String(result.product?.id || ''),
      metadata: result.product || {}
    });
    res.status(201).json(result);
  } catch (error) {
    console.error('创建支付档位失败:', error);
    res.status(error.statusCode || 500).json({ message: error.message || '创建支付档位失败' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const result = await paymentService.updateAdminPaymentProduct({ ...req.body, id: req.params.id });
    await recordAdminAuditLog(getPool(), {
      ...buildAuditContext(req),
      action: 'payment_products.update',
      resourceType: 'payment_product',
      resourceId: String(req.params.id || ''),
      metadata: result.product || {}
    });
    res.json(result);
  } catch (error) {
    console.error('更新支付档位失败:', error);
    res.status(error.statusCode || 500).json({ message: error.message || '更新支付档位失败' });
  }
};
```

Also add `copyProduct`, `createPromotion`, and `updatePromotion` with the same pattern and action names:

- `payment_products.copy`
- `payment_promotions.create`
- `payment_promotions.update`

- [ ] **Step 2: Export controller handlers**

```js
module.exports = {
  listProducts,
  createProduct,
  updateProduct,
  copyProduct,
  createPromotion,
  updatePromotion
};
```

- [ ] **Step 3: Register routes**

In `backend/routes/admin.js`, import:

```js
const adminPaymentProductController = require('../controllers/adminPaymentProductController');
```

Add before order routes:

```js
router.get('/payment-products', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.listProducts);
router.post('/payment-products', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.createProduct);
router.put('/payment-products/:id', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.updateProduct);
router.post('/payment-products/:id/copy', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.copyProduct);
router.post('/payment-products/:id/promotions', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.createPromotion);
router.put('/payment-promotions/:id', authenticateToken, checkAdminPermission, requireSuperAdminPermission, adminPaymentProductController.updatePromotion);
```

- [ ] **Step 4: Verify syntax**

Run:

```bash
node --check backend/controllers/adminPaymentProductController.js
node --check backend/routes/admin.js
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/adminPaymentProductController.js backend/routes/admin.js
git commit -m "feat(admin): add payment product API"
```

## Task 8: Admin Product Management Page

**Files:**
- Create: `src/admin/views/PaymentProductManagement.vue`
- Modify: `src/admin/layout/AdminLayout.vue`
- Modify: `src/router/index.js`

- [ ] **Step 1: Add route**

In `src/router/index.js`, add lazy import:

```js
const PaymentProductManagement = () => import('../admin/views/PaymentProductManagement.vue')
```

Add route:

```js
{
  path: '/admin/payment-products',
  name: 'PaymentProductManagement',
  component: PaymentProductManagement,
  meta: { requiresAuth: true, requiresAdmin: true, hideSidebar: true, hideTopbar: true, hideOverlays: true }
}
```

- [ ] **Step 2: Add admin menu entry**

In `AdminLayout.vue`, add:

```js
{ path: '/admin/payment-products', label: '支付档位', icon: 'fa fa-tags' },
```

Place it near orders and redeem-code management.

- [ ] **Step 3: Create page template**

Create `PaymentProductManagement.vue` with:

```vue
<template>
  <AdminLayout title="支付档位" description="配置月卡、充值档位和限时促销">
    <template #actions>
      <el-button @click="fetchProducts">
        <i class="fa fa-refresh"></i>
        刷新
      </el-button>
      <el-button type="primary" @click="openCreate">
        <i class="fa fa-plus"></i>
        新增档位
      </el-button>
    </template>

    <el-card class="admin-panel-card" shadow="never">
      <div class="product-filter-bar">
        <el-input v-model="filters.keyword" clearable placeholder="搜索名称或 SKU" @keyup.enter="fetchProducts" />
        <el-select v-model="filters.productType" clearable placeholder="全部类型" @change="fetchProducts">
          <el-option label="月卡订阅" value="subscription" />
          <el-option label="额度充值" value="recharge" />
        </el-select>
        <el-select v-model="filters.status" clearable placeholder="全部状态" @change="fetchProducts">
          <el-option label="上架" value="active" />
          <el-option label="下架" value="inactive" />
        </el-select>
        <el-button :loading="isLoading" @click="fetchProducts">查询</el-button>
      </div>

      <el-table :data="products" height="100%" row-key="id">
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="档位" min-width="220">
          <template #default="{ row }">
            <strong>{{ row.name }}</strong>
            <small>{{ row.skuId }}</small>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="110">
          <template #default="{ row }">{{ productTypeText(row.productType) }}</template>
        </el-table-column>
        <el-table-column label="价格" width="120">
          <template #default="{ row }">¥{{ row.price || row.basePrice }}</template>
        </el-table-column>
        <el-table-column label="额度" min-width="150">
          <template #default="{ row }">{{ quotaText(row) }}</template>
        </el-table-column>
        <el-table-column label="促销" min-width="160">
          <template #default="{ row }">{{ row.activePromotion?.title || '-' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">{{ row.status === 'active' ? '上架' : '下架' }}</template>
        </el-table-column>
        <el-table-column label="操作" width="250" fixed="right">
          <template #default="{ row }">
            <el-button size="small" @click="openEdit(row)">编辑</el-button>
            <el-button size="small" @click="copyProduct(row)">复制</el-button>
            <el-button size="small" @click="openPromotion(row)">促销</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </AdminLayout>
</template>
```

- [ ] **Step 4: Add script logic**

Use `apiCall`, `ElMessage`, and `AdminLayout`. Define forms with explicit defaults:

```js
const defaultProductForm = () => ({
  id: null,
  productType: 'subscription',
  skuId: '',
  name: '',
  subject: '',
  description: '',
  basePrice: '0.00',
  baseQuotaUsd: '0.00',
  dailyQuotaUsd: '0.00',
  mainRedeemSkuId: '',
  bonusRedeemSkuId: 'usd-30-bonus',
  bonusQuotaUsd: '30.00',
  recommended: false,
  cardBadge: '',
  cardFeatures: [],
  orderNote: '',
  sortOrder: 0,
  status: 'active'
});
```

Implement:

- `fetchProducts`
- `openCreate`
- `openEdit`
- `saveProduct`
- `copyProduct`
- `openPromotion`
- `savePromotion`

Use endpoints from Task 7.

- [ ] **Step 5: Add editor drawer**

Add an `el-drawer` with `el-form` fields for:

- type
- SKU
- name
- subject
- price
- daily quota
- recharge quota
- main redeem SKU
- bonus redeem SKU
- bonus quota
- recommended
- badge
- status
- order note
- feature lines as textarea split by newline

- [ ] **Step 6: Add promotion drawer**

Add an `el-drawer` with:

- title
- badge text
- starts at
- ends at
- promotion price
- promotion bonus quota
- limit once
- status

- [ ] **Step 7: Add scoped styles**

Use the same dense admin layout as `OrderManagement.vue`: `.admin-panel-card`, `.product-filter-bar`, table `strong/small`, and responsive filter stacking.

- [ ] **Step 8: Verify frontend build**

Run:

```bash
npm run build
```

Expected: build exits 0.

- [ ] **Step 9: Commit**

```bash
git add src/admin/views/PaymentProductManagement.vue src/admin/layout/AdminLayout.vue src/router/index.js
git commit -m "feat(admin): add payment product management page"
```

## Task 9: Payment Page Catalog Migration

**Files:**
- Modify: `src/views/Payment.vue`

- [ ] **Step 1: Remove hard-coded plan presentation**

Delete `planPresentation`.

Use server-provided:

- `recommended`
- `cardBadge`
- `features`
- `price`
- `basePrice`
- `bonusQuotaUsd`
- `activePromotion`

- [ ] **Step 2: Normalize catalog response**

In `loadPaymentCatalog`, read:

```js
const subscriptionSource = catalog.subscriptionProducts || catalog.plans || [];
const rechargeSource = catalog.rechargeProducts || catalog.rechargePackages || [];
```

Map subscription products with:

```js
plans.value = subscriptionSource.map((plan) => {
  const bonusRedeemCodeUsed = Boolean(plan.bonusRedeemCodeUsed);
  const hasPlanBonus = Number(plan.bonusQuotaUsd || 0) > 0 && !bonusRedeemCodeUsed;
  return {
    ...plan,
    priceText: formatMoney(plan.price || plan.displayPrice),
    dailyQuota: formatQuota(plan.dailyQuotaUsd),
    hasPlanBonus,
    bonusText: plan.activePromotion?.badgeText || (hasPlanBonus ? formatRechargeBonus(plan.bonusQuotaUsd, 0) : ''),
    bonusQuotaText: hasPlanBonus ? formatBonusQuota(plan.bonusQuotaUsd) : '',
    bonusRedeemCodeUsed,
    hasBonusStock: normalizeStock(plan.bonusRedeemCodesAvailable) > 0,
    bonusStockText: formatRedeemStock(plan.bonusRedeemCodesAvailable, '赠送码'),
    features: plan.features || []
  };
});
```

- [ ] **Step 3: Use product IDs for selection**

Change defaults:

```js
const selectedPlanId = ref('')
const selectedRechargePackageId = ref('')
```

After loading catalog, set defaults if empty:

```js
if (!selectedPlanId.value && plans.value[0]) selectedPlanId.value = plans.value[0].id;
if (!selectedRechargePackageId.value && rechargePackages.value[0]) selectedRechargePackageId.value = rechargePackages.value[0].id;
```

- [ ] **Step 4: Submit `productId`**

Change request body:

```js
body: JSON.stringify(isSubscriptionMode.value
  ? {
      productType: 'subscription',
      productId: selectedPlanId.value,
      durationId: selectedDurationId.value
    }
  : {
      productType: 'recharge',
      productId: selectedRechargePackageId.value
    })
```

- [ ] **Step 5: Verify frontend build**

Run:

```bash
npm run build
```

Expected: build exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/views/Payment.vue
git commit -m "feat(payment): render dynamic product catalog"
```

## Task 10: Temporary Behavioral Tests And Final Verification

**Files:**
- Temporary create/delete: `temp-test/payment-products.test.js`
- Verify existing code paths only; do not commit `temp-test/`.

- [ ] **Step 1: Create temporary test directory**

```bash
mkdir -p temp-test
```

- [ ] **Step 2: Add temporary tests**

Create `temp-test/payment-products.test.js` with Node `assert` tests for pure helpers:

```js
const assert = require('assert');
const {
  normalizeMoney,
  parseJsonArray,
  isPromotionActive,
  resolveEffectiveProduct
} = require('../backend/services/payment/paymentProductUtils');

assert.strictEqual(normalizeMoney('19.9'), '19.90');
assert.deepStrictEqual(parseJsonArray('["A","B"]'), ['A', 'B']);
assert.strictEqual(isPromotionActive({ status: 'inactive' }), false);

const effective = resolveEffectiveProduct(
  { base_price: '69.90', base_quota_usd: '0.00', bonus_quota_usd: '30.00' },
  { status: 'active', promotion_price: '49.90', promotion_bonus_quota_usd: '50.00' }
);
assert.strictEqual(effective.displayPrice, '49.90');
assert.strictEqual(effective.bonusQuotaUsd, '50.00');

console.log('payment product helper tests passed');
```

- [ ] **Step 3: Run temporary tests**

```bash
node temp-test/payment-products.test.js
```

Expected output includes:

```text
payment product helper tests passed
```

- [ ] **Step 4: Delete temporary tests**

```bash
rm -rf temp-test
```

- [ ] **Step 5: Run syntax checks**

```bash
node --check backend/repositories/paymentRepository.js
node --check backend/services/payment/paymentProductUtils.js
node --check backend/services/payment/paymentClaimService.js
node --check backend/services/payment/paymentProductService.js
node --check backend/services/payment/paymentCatalogService.js
node --check backend/services/payment/alipayOrderService.js
node --check backend/services/payment/paymentFulfillmentService.js
node --check backend/services/payment/paymentOrderQueryService.js
node --check backend/services/payment/redeemCodeService.js
node --check backend/controllers/adminPaymentProductController.js
node --check backend/routes/admin.js
```

Expected: every command exits 0.

- [ ] **Step 6: Run frontend build**

```bash
npm run build
```

Expected: build exits 0.

- [ ] **Step 7: Run diff whitespace check**

```bash
git diff --check
```

Expected: command exits 0.

- [ ] **Step 8: Check worktree**

```bash
git status --short
```

Expected: no `temp-test/` files remain.

- [ ] **Step 9: Final commit if any verification-only fixes were needed**

If verification forced small fixes after the previous task commits, replace the file list below with the concrete changed files from `git status --short`:

```bash
git add backend/services/payment/paymentProductService.js
git commit -m "fix(payment): polish product management flow"
```

Skip this commit if there are no new changes.

## Self-Review Notes

- Spec coverage: data model, default seeding, public catalog, admin UI, order snapshots, dynamic fulfillment, claim reuse, migration fallback, and verification are each mapped to a task.
- Scope check: coupons, segmentation, dynamic durations, and stacked promotions remain excluded.
- Temporary tests: the plan uses `temp-test/` and deletes it before completion.
- Type consistency: product IDs are used for new order creation, with legacy SKU fallback handled in the product service during migration.
