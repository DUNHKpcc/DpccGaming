# Payment Products Management Design

Date: 2026-05-10

## Context

The payment page currently renders subscription cards and recharge cards from hard-coded product data:

- `backend/services/payment/plans.js` owns fixed subscription plans, recharge packages, durations, and the `$30` bonus package.
- `src/views/Payment.vue` adds presentation details such as card feature text, recommended flags, bonus labels, and stock text.
- The admin area has order and redeem-code management, but it has no payment product management page.
- Paid-order fulfillment already supports redeem-code assignment, bonus-code assignment, Alipay `buyer_id`, and a unique claim table for one-time bonus behavior.

This design decouples payment products from static code so super admins can add and edit payment tiers from the admin UI. It keeps the first implementation focused on dynamic products, promotion rules, order snapshots, and reusable claim logic.

## Goals

- Let super admins configure both subscription products and recharge products from the admin area.
- Keep subscription durations fixed for now: `1m`, `3m`, and `12m`.
- Support product fields for amount, quota, copy, card labels, feature text, sort order, recommended state, and active/inactive state.
- Support time-limited promotions with promotion price, promotion label, promotion bonus quota, and optional one-time purchase restriction by site user.
- Continue to issue bonus quota through bonus redeem-code inventory.
- Reuse the current claim-table mechanism for both bonus-code eligibility and promotion one-time purchase limits.
- Store an order-time snapshot so paid and historical orders are not affected by later product edits.
- Reduce duplicate business logic by centralizing product normalization, promotion resolution, amount calculation, and claim helpers.

## Non-Goals

- Do not build coupon codes.
- Do not build audience segmentation, per-user pricing, or member-specific pricing.
- Do not support multiple stackable promotions on the same product.
- Do not let admins configure subscription durations in this pass.
- Do not replace the existing Alipay integration.
- Do not redesign redeem-code import or inventory management beyond the product SKU links needed here.
- Do not create permanent test files; temporary verification files must follow the repository `temp-test/` policy and be removed before completion.

## Recommended Approach

Use separate tables for payment products and promotion rules, plus immutable order snapshots.

This is more explicit than putting all promotion fields directly on the product row, but it avoids mixing long-lived product identity with short-lived campaign behavior. It also stays much smaller than a general e-commerce engine.

## Data Model

### `payment_products`

Stores configurable subscription and recharge tiers.

Core fields:

- `id`
- `product_type`: `subscription` or `recharge`
- `sku_id`: stable internal identifier used by order creation and redeem-code inventory
- `name`
- `subject`
- `description`
- `base_price`
- `currency`
- `base_quota_usd`: recharge credited quota, or subscription bonus balance baseline where applicable
- `daily_quota_usd`: subscription daily quota; null for recharge products
- `main_redeem_sku_id`: redeem-code SKU for normal recharge delivery; null when not applicable
- `bonus_redeem_sku_id`: redeem-code SKU for bonus delivery
- `bonus_quota_usd`
- `recommended`
- `card_badge`
- `card_features_json`
- `order_note`
- `sort_order`
- `status`: `active` or `inactive`
- timestamps

`sku_id` should remain stable after creation. Admins can change display text and pricing, but existing orders must continue to rely on their snapshots.

### `payment_promotions`

Stores optional promotion rules for products.

Core fields:

- `id`
- `product_id`
- `title`
- `badge_text`
- `starts_at`
- `ends_at`
- `promotion_price`
- `promotion_bonus_quota_usd`
- `limit_once`
- `limit_scope`: first implementation supports `user`; payer-level promotion price limits are intentionally excluded because Alipay `buyer_id` is only known after payment
- `claim_scope_key`: stable key used by claim logic, for example `promotion:<promotion_id>`
- `status`: `active` or `inactive`
- timestamps

Only one active promotion may be effective for the same product at the same time. Admin validation should reject overlapping active windows.

### `payment_orders` Snapshot Fields

Orders should keep the existing columns and gain snapshot fields that record what was sold at order creation time.

Snapshot fields:

- `product_snapshot_json`: product type, product id, sku id, name, subject, base quota, daily quota, card/order note, and redeem SKU choices
- `promotion_snapshot_json`: promotion id, title, badge, promotion price, promotion bonus quota, limit-once state, and claim key when a promotion applies
- `amount`: final locked payment amount, not recalculated after creation
- `quota_usd`: final locked user-facing quota for this order

Historical order display should prefer snapshot names and values. Product edits only affect newly created orders.

### `payment_bonus_claims`

Keep the current table, but use clearer helper-level semantics:

- `claim_type = user`, `claim_key = <user_id>` can continue to represent bonus-code one-time use.
- `claim_type = alipay_buyer`, `claim_key = <buyer_id>` can continue to represent Alipay payer one-time use.
- For promotion limits, add scoped user claim types or scoped user keys through the helper, for example `promotion_user`, or `claim_key = <promotion_claim_scope>:<user_id>`.

The exact representation should be hidden behind shared claim helper functions so fulfillment code does not hand-build claim keys in multiple places.

## Backend Services

### `paymentProductService`

New service for product catalog and admin product workflows.

Responsibilities:

- List public catalog products.
- List admin products.
- Create, update, activate, deactivate, and copy products.
- Create and update promotion rules.
- Resolve the currently effective promotion for a product.
- Normalize products into one response shape consumed by the payment page and admin UI.
- Build order snapshots from product plus promotion state.

### Shared Helpers

To reduce code duplication, shared helpers should handle:

- money normalization and cent-based arithmetic
- quota normalization
- product type normalization
- card feature parsing and serialization
- promotion-window checks
- final price and final quota calculation
- inventory summary attachment
- user bonus-used and promotion-used state

`Payment.vue`, the admin product page, Alipay order creation, and fulfillment should consume these normalized objects instead of each recomputing fields.

### Claim Helper

Extract the current bonus claim behavior into reusable helper functions:

- acquire user claim
- acquire Alipay buyer claim
- acquire both user and payer claims
- acquire promotion user claim
- release claims on assignment failure
- return structured reasons such as `already_used`, `payer_missing`, and `claim_failed`

The helper should support both bonus redeem-code claims and promotion one-time claims by accepting a scoped claim purpose. Bonus redeem-code claims can use both site user and Alipay buyer id. Promotion price limits should use site-user claims in the first implementation so the backend can decide the final payment amount before building the Alipay order.

## Public Catalog Flow

`GET /api/payments/catalog` should return database-driven products:

- `subscriptionProducts`
- `rechargeProducts`
- `durations`
- `bonusRedeemCodeStock`

For backward compatibility during migration, it may also keep `plans` and `rechargePackages` aliases until the frontend is fully switched.

Each product response should include:

- identity fields
- display name and card text
- original price
- display price
- active promotion details
- final quota text inputs
- recommended state
- card features
- stock and eligibility flags
- whether the user has already used the bonus or promotion one-time claim
- whether the product is purchasable

The payment page should render these fields directly and avoid hard-coded `bronze`, `gold`, `platinum`, or `usd-*` assumptions.

## Order Creation Flow

The Alipay order endpoint should accept:

- subscription: `productId` and `durationId`
- recharge: `productId`

The backend must:

1. Load the active product.
2. Resolve the current active promotion.
3. Check current user bonus eligibility and promotion one-time eligibility.
4. Calculate final amount and final quota from trusted server-side data.
5. Write a payment order with snapshot JSON and locked amount.
6. Build the Alipay form from the locked order amount and subject.

The frontend must not submit or control final amount, quota, promotion price, or bonus eligibility.

## Fulfillment Flow

Alipay notify handling keeps the current verification sequence:

- verify signature
- verify app id
- verify seller id when configured
- ignore non-success trade statuses
- lock the order in a transaction
- compare paid amount against the locked order amount

Fulfillment should use the order snapshot:

- subscription orders update membership and optionally grant bonus balance through bonus redeem code rules.
- recharge orders assign the main redeem-code SKU from the snapshot.
- bonus redeem codes use the snapshot bonus SKU and existing stock assignment path.
- promotion one-time claims use the same claim helper as bonus-code claims, but apply to site-user eligibility decided at order creation.

If an order needs buyer-level claim enforcement but Alipay did not provide `buyer_id`, fulfillment should not auto-grant restricted benefits. It should mark the relevant benefit as manual-required or skipped according to the snapshot policy.

Repeated Alipay callbacks must remain idempotent. A paid order should not receive extra balance or extra redeem codes.

## Admin UI

Add a super-admin page at `/admin/payment-products`.

The page should follow the existing Element Plus admin style and include:

- filter bar: product type, status, keyword
- product table: sort order, type, name, base price, effective display price, quota, bonus quota, promotion status, recommended state, active state, updated time
- actions: create, edit, copy, activate/deactivate, manage promotion
- drawer or dialog editor split into focused sections

Editor sections:

- Basic info: product type, sku id, name, subject, price, daily quota or recharge quota
- Card display: recommended flag, sort order, badge, feature lines, order note
- Delivery rules: main redeem SKU, bonus redeem SKU, bonus quota
- Promotion: title, badge text, active window, promotion price, promotion bonus quota, site-user one-time purchase limit

The admin frontend should send plain form data. The backend owns validation, normalization, overlap checks, and computed preview values.

## Payment Page UI

The current payment page layout can remain mostly intact:

- keep the product-mode switch for subscription vs recharge
- render catalog-driven product cards
- render fixed duration choices for subscription
- render server-provided badges, features, price, bonus, stock, and eligibility text
- preserve the order confirmation panel

Remove hard-coded presentation maps from the page once the backend supplies card features and recommended state.

## Migration Strategy

On first startup, seed the database with the current hard-coded products:

- bronze, gold, platinum subscription products
- current recharge packages
- current `$30` bonus redeem-code SKU
- current card feature text and recommended state where applicable

Keep static product data as a read-only fallback if the product tables are unavailable or empty. This prevents the payment page from going blank during deployment. Once seeded successfully, database rows become the source of truth.

Existing orders remain valid. New snapshot fields may be null for older orders; order query mappers should fall back to existing columns and legacy product lookup when snapshots are missing.

## Validation And Error Handling

Admin validation:

- `sku_id` required and unique among products
- amount must be non-negative and normalized to two decimals
- quota values must be non-negative
- subscription products require `daily_quota_usd`
- recharge products require `base_quota_usd`
- active products require enough fields to build a valid Alipay subject
- promotion end time must be after start time
- active promotion windows must not overlap for the same product
- promotion one-time purchase limits apply to site users in this pass; Alipay-buyer promotion price limits are out of scope because they cannot be known before order amount locking

Runtime behavior:

- inactive products are hidden from the public catalog and rejected by order creation
- inactive promotions are ignored
- expired promotions are ignored
- products can be edited without changing existing order snapshots
- unpaid locked orders may complete within their existing expiry window even if the product is later deactivated
- expired unpaid orders close through the existing close-expired flow

## Verification

Use temporary tests under `temp-test/` when tests are needed, and delete them before finishing.

Recommended checks:

```bash
node --check backend/services/payment/paymentProductService.js
node --check backend/services/payment/paymentFulfillmentService.js
node --check backend/services/payment/alipayOrderService.js
node --check backend/repositories/paymentRepository.js
npm run build
git diff --check
```

Behavioral scenarios to verify:

- catalog falls back to seeded/default products when product tables are empty
- admin can create, edit, deactivate, and copy subscription and recharge products
- public catalog hides inactive products
- promotion price and promotion bonus appear only inside the active window
- overlapping active promotions for one product are rejected
- creating an order stores the expected product and promotion snapshot
- editing a product after order creation does not change the order amount or fulfillment benefits
- bonus redeem-code one-time restriction still works by user and Alipay buyer id
- promotion one-time restriction works by site user
- missing Alipay `buyer_id` sends restricted benefits to manual handling
- repeated Alipay callbacks remain idempotent

## Risks And Mitigations

- Risk: product and promotion logic gets duplicated across frontend, admin, order creation, and fulfillment.
  Mitigation: make `paymentProductService` and shared helpers the only place that computes effective product state.

- Risk: historical orders display changed product names or prices after admin edits.
  Mitigation: store and prefer order snapshots.

- Risk: promotion limits accidentally block normal purchases.
  Mitigation: calculate site-user promotion eligibility during order creation; if a user already used the promotion, create a normal product order without promotion benefits.

- Risk: deployment creates an empty payment catalog.
  Mitigation: seed current hard-coded products and keep static fallback data.

- Risk: the change grows into a full commerce engine.
  Mitigation: explicitly exclude coupons, segmentation, configurable durations, and stacked promotions from this pass.
