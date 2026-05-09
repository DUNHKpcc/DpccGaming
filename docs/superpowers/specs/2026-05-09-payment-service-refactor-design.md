# Payment Service Refactor Design

Date: 2026-05-09

## Context

`backend/services/payment/paymentService.js` is currently about 1160 lines and mixes several responsibilities:

- Public payment catalog and order creation
- Alipay configuration, order form creation, and async notify handling
- Paid-order fulfillment, redeem-code assignment, bonus-code claim logic, membership updates, and balance updates
- Admin redeem-code import/list/secret/delete workflows
- User and admin payment-order result mapping
- Shared date, order-number, masking, normalization, and formatting helpers

The current controllers all import `../services/payment/paymentService`, so the lowest-risk refactor is to keep that file as a stable facade while moving internal responsibilities into smaller modules.

## Goals

- Reduce `paymentService.js` to a thin compatibility facade.
- Keep every existing exported function name stable.
- Avoid changing controller imports in this first refactor.
- Avoid changing payment behavior, database schema semantics, or frontend behavior.
- Make payment fulfillment and bonus claim logic easier to review independently.
- Keep each new module focused enough to understand without reading the entire payment subsystem.

## Non-Goals

- Do not redesign the payment flow.
- Do not change the public API response shape.
- Do not split `paymentRepository.js` in this pass.
- Do not add new business rules or alter the current bonus-code policy.
- Do not rewrite tests or introduce a new test framework.

## Proposed Module Layout

All new modules live under `backend/services/payment/`.

### `paymentUtils.js`

Pure helpers and constants that do not call the database:

- `toMysqlDateTime`
- `addMonths`
- `addMinutes`
- `parseStoredDateTime`
- `isPaymentAfterOrderExpiry`
- `createOrderNo`
- `maskRedeemCode`
- normalization helpers for redeem code inputs and IDs
- shared support constants such as support WeChat and redeem URL

This module should not import repository or payment provider code.

### `paymentCatalogService.js`

Catalog and SKU metadata workflows:

- `getCatalog`
- `getRedeemCodeCatalog`
- inventory aggregation
- current-user bonus-code-used presentation state

It may depend on `plans`, `repository`, and small helpers from `paymentUtils`.

### `redeemCodeService.js`

Admin redeem-code inventory workflows:

- `importRedeemCodes`
- `listRedeemCodes`
- `getRedeemCodeSecret`
- `deleteRedeemCode`
- `deleteRedeemCodes`

It owns encryption/decryption usage for admin inventory operations and should not handle payment callbacks or order fulfillment.

### `paymentOrderQueryService.js`

Order read and admin order management workflows:

- `getPaymentOrderResult`
- `listAdminPaymentOrders`
- `getAdminPaymentOrderDetail`
- `deleteAdminPaymentOrder`
- order-to-response mappers such as admin order mapping and product-name resolution

It may use the redeem-code decode helper for displaying assigned codes, but it must not assign new codes or mutate fulfillment.

### `paymentFulfillmentService.js`

Paid-order fulfillment workflows:

- primary redeem-code assignment
- bonus redeem-code assignment
- bonus claim acquisition/release
- membership and balance updates
- fulfillment status and support-note updates

This module should expose a small API used by Alipay notify handling, for example `handlePaidOrder`.

### `alipayOrderService.js`

Alipay-facing workflows:

- `createAlipayOrder`
- `handleAlipayNotify`
- `parseAlipayPaymentDate`
- Alipay create-time configuration validation

It should call `paymentFulfillmentService.handlePaidOrder` after notification verification instead of owning fulfillment internals.

### `paymentService.js`

Compatibility facade only. It re-exports the same function names currently consumed by controllers:

- `getCatalog`
- `getRedeemCodeCatalog`
- `importRedeemCodes`
- `listRedeemCodes`
- `getRedeemCodeSecret`
- `deleteRedeemCode`
- `deleteRedeemCodes`
- `getPaymentOrderResult`
- `listAdminPaymentOrders`
- `getAdminPaymentOrderDetail`
- `deleteAdminPaymentOrder`
- `submitPaymentOrderApiUsername`
- `createAlipayOrder`
- `handleAlipayNotify`
- `handlePaidOrder`
- `parseAlipayPaymentDate`
- existing exported support constants and date helpers

No controller import path changes are required.

## Data Flow After Refactor

### Catalog

Controller calls `paymentService.getCatalog`.

`paymentService` delegates to `paymentCatalogService.getCatalog`, which reads inventory and current user bonus status from the repository and returns the existing catalog shape.

### Create Alipay Order

Controller calls `paymentService.createAlipayOrder`.

`paymentService` delegates to `alipayOrderService.createAlipayOrder`, which validates plan/package input, creates the payment order, and builds the Alipay form.

### Alipay Notify

Controller calls `paymentService.handleAlipayNotify`.

`alipayOrderService.handleAlipayNotify` verifies Alipay params and delegates paid-order fulfillment to `paymentFulfillmentService.handlePaidOrder`.

`paymentFulfillmentService` owns the transaction, order locking, expiration checks, redeem-code assignment, bonus claim behavior, membership updates, balance updates, and fulfillment fields.

### Admin Redeem Codes

Admin redeem-code controller still imports `paymentService`.

The facade delegates to `redeemCodeService`, preserving the same response shape and error behavior.

### Order Queries

User and admin order queries route through `paymentOrderQueryService`, preserving existing order result and admin mapping shapes.

## Error Handling

- Keep current `Error` + `statusCode` pattern.
- Do not introduce custom error classes in this refactor.
- Preserve existing error messages unless moving code forces a direct import of a shared constant.
- Modules should throw; controllers continue to translate errors into HTTP responses.

## Refactor Strategy

Use a mechanical extraction sequence:

1. Extract pure helpers/constants first.
2. Extract redeem-code inventory functions.
3. Extract order query and admin order mapping functions.
4. Extract fulfillment functions.
5. Extract Alipay order/notify functions.
6. Replace `paymentService.js` with facade exports.

At each step, keep function bodies as unchanged as possible. Adjust only imports, exports, and direct references required by the move.

## Verification

Run these checks after the refactor:

```bash
node --check backend/services/payment/paymentService.js
node --check backend/services/payment/paymentUtils.js
node --check backend/services/payment/paymentCatalogService.js
node --check backend/services/payment/redeemCodeService.js
node --check backend/services/payment/paymentOrderQueryService.js
node --check backend/services/payment/paymentFulfillmentService.js
node --check backend/services/payment/alipayOrderService.js
npm run build
git diff --check
```

Success means all commands exit 0 and the public exported API of `paymentService.js` remains compatible with current controller usage.

## Risks And Mitigations

- Risk: circular imports between modules.
  Mitigation: keep shared helpers in `paymentUtils.js`; keep provider code in `alipayOrderService`; keep fulfillment independent of catalog/admin modules.

- Risk: accidentally changing response shape.
  Mitigation: move existing mapper functions intact before simplifying anything.

- Risk: hidden dependency on internal helper exports.
  Mitigation: search for `paymentService.` usage before and after refactor, and keep facade exports unchanged.

- Risk: current worktree already has payment behavior changes.
  Mitigation: treat this as a structural refactor on top of the current working tree, preserving the current behavior exactly.

