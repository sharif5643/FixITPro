# Phase 4B.1A — POS Accounting Integration Audit

**Status:** AUDIT COMPLETE — READ-ONLY  
**Date:** 2026-08-17  
**Scope:** FixITPro POS → Double-Entry Accounting integration analysis  
**Files modified:** NONE  
**Migrations:** NONE  
**JournalEntry rows created:** NONE

---

## Table of Contents

1. [POS Architecture](#1-pos-architecture)
2. [Sale Flow](#2-sale-flow)
3. [Payment Flow](#3-payment-flow)
4. [Stock Flow](#4-stock-flow)
5. [Cash Flow](#5-cash-flow)
6. [Transaction Boundaries](#6-transaction-boundaries)
7. [Cost / COGS](#7-cost--cogs)
8. [Integration Options](#8-integration-options)
9. [Recommended Integration Point](#9-recommended-integration-point)
10. [Failure Handling](#10-failure-handling)
11. [Idempotency](#11-idempotency)
12. [Tenant Isolation](#12-tenant-isolation)
13. [Journal Mapping](#13-journal-mapping)
14. [Data Gaps](#14-data-gaps)
15. [Risk Assessment](#15-risk-assessment)
16. [Proposed Phase 4B.1 Implementation Plan](#16-proposed-phase-4b1-implementation-plan)

---

## 1. POS Architecture

### Modules involved

| Module | Service | File |
|--------|---------|------|
| Sales | `SalesService` | `backend/src/sales/sales.service.ts` (1 025 lines) |
| Sales HTTP | `SalesController` | `backend/src/sales/sales.controller.ts` |
| Cash Drawer Ledger | `AccountingService` | `backend/src/accounting/accounting.service.ts` |
| Cash Drawer Session | `CashDrawerService` | `backend/src/cash-drawer/cash-drawer.service.ts` |
| Stock Adjustments (admin only) | `StockService` | `backend/src/stock/stock.service.ts` |
| Audit | `AuditLogService` | `backend/src/audit-log/audit-log.service.ts` |
| Notifications | `NotificationsService` | `backend/src/notifications/notifications.service.ts` |

### Guards on POST /sales

`JwtAuthGuard` → `TenantActiveGuard` → `ModuleGuard('pos')` → `PermissionGuard('sales.create')`

### Database Models (schema.prisma)

| Model | Key fields |
|-------|-----------|
| `Sale` | id, receiptNumber, status, subtotal, discount, total, paymentMethod, amountPaid, change, branchId (NO tenantId) |
| `SaleItem` | id, quantity, price, costPrice, discount, total, saleId, productId |
| `SalePayment` | id, saleId, paymentMethod, amount, sortOrder (NO tenantId, NO branchId) |
| `SaleRefund` | id, refundNumber, reason, totalRefund, paymentMethod, saleId |
| `SaleRefundItem` | id, refundId, saleItemId, quantity, price, costPrice |
| `StockMovement` | id, type, quantity, saleItemId, branchId |
| `CashDrawerTransaction` | id, type, direction, amount, sourceType, referenceType, referenceId, idempotencyKey, sessionId, tenantId, branchId, actorUserId |

---

## 2. Sale Flow

### Complete POS checkout sequence

```
HTTP POST /sales
    │
    ▼
SalesController.create(dto, req)
    │  Resolves branchId: OWNER/SUPER_ADMIN → dto.branchId; STAFF → JWT branchId
    │
    ▼
SalesService.create(dto, userId, branchId, tenantId)
    │
    ├─ assertBranchActive(branchId, tenantId)        [SELECT Branch]
    ├─ findFirst active Shift for userId              [SELECT Shift]
    ├─ findMany active Products by ids                [SELECT Product[] + BranchStock[]]
    ├─ Optimistic stock check (fast-fail)
    │
    ├─ Compute totals in JavaScript:
    │    subtotal = Σ(item.price × qty − item.discount)
    │    discount = dto.discount
    │    total = subtotal − discount
    │    paymentLegs = normalise(dto.payments[]) | legacy dto.paymentMethod
    │    totalPaid = Σ(leg.amount)
    │    change = totalPaid − total
    │    primaryMethod = leg with max amount
    │
    └─ prisma.$transaction(async (tx) => {           ← SINGLE ATOMIC TRANSACTION
           │
           ├─ resolveCustomerIdInTx(tx, dto, tenantId)  [find-or-create Customer]
           │
           ├─ tx.sale.create({                          [CREATE Sale]
           │    data: {
           │      receiptNumber, status: 'COMPLETED',
           │      subtotal, discount, total,
           │      paymentMethod, amountPaid, change,
           │      shiftId, branchId, userId, customerId,
           │      items:    { create: [...SaleItem] },   [nested CREATE SaleItem[]]
           │      payments: { create: [...SalePayment] } [nested CREATE SalePayment[]]
           │    }
           │  })
           │
           ├─ for each item:
           │    ├─ tx.branchStock.updateMany({ quantity: { gte: qty } }, decrement) [UPDATE BranchStock]
           │    │    → if count=0: throw BadRequestException (rollback)
           │    ├─ syncProductShadowStock(productId, tx)  [UPDATE Product.stock]
           │    ├─ tx.stockMovement.create({ type:'SALE' }) [CREATE StockMovement]
           │    └─ if hasSerial: tx.serialNumber.updateMany({ status:'SOLD' }) [UPDATE SerialNumber]
           │
           ├─ for each paymentLeg:
           │    └─ accounting.record({ sourceType:'SALE_PAYMENT', sourceId:leg.id }, tx)
           │         └─ tx.cashDrawerTransaction.create(...) [CREATE CashDrawerTransaction]
           │
           └─ auditLog.logWithTx(tx, { action:'SALE_CREATED' }) [CREATE AuditLog]
       })
           │
           ├─ post-tx: notifyLowStock() per sold product [fire-and-forget, outside tx]
           │
           └─ return { sale, message }
```

### Refund flow (`POST /sales/:id/refund`)

Single `prisma.$transaction`:
1. `SaleRefund.create` + `SaleRefundItem[]` (nested)
2. `SaleItem.update` (refundedQty increment)
3. `BranchStock.upsert` (restore quantity)
4. `StockMovement.create` (type: 'REFUND')
5. `SerialNumber.updateMany` (status: 'RETURNED' if fully refunded)
6. `Sale.update` (status: 'REFUNDED' or 'PARTIAL_REFUND')
7. `accounting.record({ direction:'OUT' })` → `CashDrawerTransaction` (WITHDRAWAL)

### Void flow (`POST /sales/:id/void`)

Single `prisma.$transaction`:
1. `Sale.update` (status: 'VOIDED', voidedById, voidedAt, voidReason)
2. `SerialNumber.updateMany` (status: 'IN_STOCK', clear saleItemId/soldAt)
3. `BranchStock.upsert` restore per item (restoreQty = quantity − refundedQty)
4. `StockMovement.create` (type: 'IN') per item
5. `accounting.record({ sourceType:'SALE_REFUND', direction:'OUT' })` per SalePayment leg → `CashDrawerTransaction` (WITHDRAWAL/REVERSAL)

### Exchange flow (`POST /sales/:id/exchange`)

Single `prisma.$transaction`:
1. Refund returned items (same as refund sub-flow)
2. Create new Sale with new SaleItems and SalePayments
3. Deduct stock for new items
4. `accounting.record` × 2: OUT for return + IN for new sale

---

## 3. Payment Flow

### Supported payment methods

Validated by `@IsIn(['CASH', 'TRANSFER', 'CARD'])` in `create-sale.dto.ts`:

| Method | DB enum value | CashDrawerTransaction type |
|--------|---------------|---------------------------|
| Cash | `CASH` | DEPOSIT (inside session) |
| Bank transfer | `TRANSFER` | DEPOSIT (sessionId=null) |
| Credit/debit card | `CARD` | DEPOSIT (sessionId=null) |

`AccountingService.PaymentMethodExt` also defines `QR | BANK | CREDIT` but these cannot reach the system through the DTO validator — the enum is `PaymentMethod { CASH, TRANSFER, CARD }`.

### Split payment

`dto.payments[]` array — each element is `{ paymentMethod, amount }`. One `SalePayment` row per leg. One `CashDrawerTransaction` per leg.

### Payment fields

**SalePayment model:**
```
id            String  PK
saleId        String  FK → Sale (CASCADE DELETE)
paymentMethod PaymentMethod
amount        Decimal(10,2)
sortOrder     Int (0-indexed, used for display)

NO tenantId
NO branchId
NO status
NO externalRef
```

**Sale aggregate fields (legacy/report compatibility):**
```
paymentMethod  = primaryMethod (leg with max amount)
amountPaid     = Σ all leg amounts
change         = amountPaid − total
```

### Change handling

When a customer tenders more cash than the total:

- `Sale.amountPaid` = tendered total (e.g. 500)
- `Sale.change` = 500 − 450 = 50
- `SalePayment.amount` = 500 (the tendered amount, NOT the net)
- `CashDrawerTransaction.amount` = 500 (tendered)

> **⚠ GAP for Accounting:** CashDrawerTransaction records the tendered amount (500), but Revenue should be 450. The journal debit to Cash should use `Sale.total` (net of change), not `SalePayment.amount`. See [Data Gaps §14.1](#141-salepaymentamount-vs-net-cash).

### Partial payment / under-payment

Not possible: `SalesService` validates `change >= 0` and throws `BadRequestException` if `totalPaid < total`.

### Refund

`SaleRefund.paymentMethod` defaults to `CASH`. The refund amount is `totalRefund` (sum of returned items × price). `accounting.record({ direction:'OUT' })` creates a `CashDrawerTransaction` WITHDRAWAL.

### Void

Each `SalePayment` leg gets a reversal `CashDrawerTransaction` (WITHDRAWAL for CASH, audit entry for non-CASH).

---

## 4. Stock Flow

### Deduction location

Stock is deducted **inside the same `prisma.$transaction` as the Sale creation**, after the Sale row is created.

**There is no `StockService.deductStock()` call.** The deduction logic is inline in `SalesService.create()`.

### Authoritative atomic write (C-1 fix)

```typescript
// Branch path
const result = await tx.branchStock.updateMany({
  where: { branchId, productId, quantity: { gte: item.quantity } },
  data:  { quantity: { decrement: item.quantity } },
});
if (result.count === 0) {
  // read actual current qty for the error message
  throw new BadRequestException(`สินค้าสต็อกไม่พอ...`);
}
// → transaction rolls back automatically
```

```typescript
// No-branch (legacy) path
await tx.product.updateMany({
  where: { id: productId, stock: { gte: item.quantity } },
  data:  { stock: { decrement: item.quantity } },
});
```

### Shadow stock sync

After each deduction: `syncProductShadowStock(productId, tx)`:
```typescript
const agg = await tx.branchStock.aggregate({ _sum: { quantity: true }, where: { productId } });
await tx.product.update({ where: { id: productId }, data: { stock: agg._sum.quantity ?? 0 } });
```
`Product.stock` is a derived shadow — the sum of all `BranchStock.quantity` for that product.

### StockMovement record

```typescript
await tx.stockMovement.create({
  data: {
    type:       'SALE',    // 'SALE' | 'REFUND' | 'IN'
    quantity:   item.quantity,
    saleItemId: saleItem.id,
    branchId,
    note:       `ขาย: ${sale.receiptNumber}`,
  },
});
```

`StockMovement` has no `tenantId` — scoped only via `branchId`.

---

## 5. Cash Flow

### AccountingService.record() call (inside POS transaction)

For each payment leg:
```typescript
await this.accounting.record({
  sourceType:    'SALE_PAYMENT',
  sourceId:      payment.id,          // SalePayment.id
  paymentMethod: payment.paymentMethod,
  amount:        Number(payment.amount), // tendered amount for that leg
  direction:     'IN',
  branchId,
  tenantId,
  actorUserId:   userId,
  note:          sale.receiptNumber,
}, tx);
```

### CashDrawerTransaction fields written

| Field | Value |
|-------|-------|
| `type` | `DEPOSIT` (mapped from SALE_PAYMENT) |
| `direction` | `IN` |
| `amount` | SalePayment.amount (tendered, not net) |
| `sourceType` | `'SALE_PAYMENT'` |
| `referenceType` | `'SALE_PAYMENT'` |
| `referenceId` | `SalePayment.id` |
| `paymentMethod` | `'CASH'` / `'TRANSFER'` / `'CARD'` |
| `reason` | `'ยอดขายเงินสด — RCP-YYYYMMDD-XXXXXX'` |
| `idempotencyKey` | `'<tenantId>:SALE_PAYMENT:<payment.id>:IN'` |
| `sessionId` | `CashDrawerSession.id` (CASH + open session) or `null` |
| `cashDrawerId` | `CashDrawer.id` |
| `tenantId` | from JWT |
| `branchId` | sale's branchId |
| `actorUserId` | user.id |
| `metadata` | `{ sourceType: 'SALE_PAYMENT', sourceId: payment.id }` |

### CASH vs non-CASH session routing

| Method | sessionId | Written inside tx |
|--------|-----------|-------------------|
| CASH + open session + STRICT | session.id | Yes (atomic with sale) |
| CASH + open session + ALLOW | session.id | Yes |
| CASH + no session + STRICT | null | Yes (warning logged) |
| CASH + no session + ALLOW | null | Outside caller's tx (best-effort) |
| TRANSFER or CARD | null | Yes (audit-only entry) |

> **Key point:** Non-CASH `CashDrawerTransaction` rows are written as audit entries with `sessionId=null`. They represent the payment event but are not counted in any session's cash balance.

---

## 6. Transaction Boundaries

### POS transaction — single `prisma.$transaction`

The entire POS checkout is wrapped in one atomic boundary:

| Operation | Model | Method |
|-----------|-------|--------|
| Create customer (if new) | Customer | findFirst / create |
| Create sale header | Sale | create |
| Create sale lines | SaleItem | nested inside Sale.create |
| Create payment records | SalePayment | nested inside Sale.create |
| Deduct branch stock | BranchStock | updateMany (atomic conditional) |
| Sync product shadow | Product | update |
| Record stock movement | StockMovement | create |
| Update serial numbers | SerialNumber | updateMany (if hasSerial) |
| Create cash ledger entry | CashDrawerTransaction | create (via AccountingService) |
| Write audit log | AuditLog | create (via AuditLogService.logWithTx) |

**All-or-nothing:** Any exception in any step triggers full rollback. No orphaned Sale, no stock leak, no partial payment record.

### Outside the transaction (post-commit, fire-and-forget)

| Operation | Model | Behavior |
|-----------|-------|----------|
| Low-stock notification | Notification | Best-effort; failure is logged but never surfaces to POS |
| Large-refund notification | Notification | Same |
| Void notification | Notification | Same |

### No event bus

There is no `EventEmitter2`, Bull queue, RabbitMQ, Kafka, or WebSocket publish in the sale completion path. Everything is synchronous and DB-only.

---

## 7. Cost / COGS

### costPrice is snapshotted at point-of-sale

`SaleItem.costPrice Decimal(10,2) @default(0)` is written at creation time:

```typescript
// sales.service.ts ~line 220
costPrice: Number(products.find((p) => p.id === item.productId)?.costPrice ?? 0),
```

`products` is the pre-fetched list from `Product.findMany` before the transaction. If `Product.costPrice` changes later, historical `SaleItem.costPrice` values are **not affected**.

### Edge cases

| Scenario | SaleItem.costPrice | COGS accuracy |
|----------|--------------------|---------------|
| Product had costPrice set | Captured correctly | ✓ Accurate |
| Product had costPrice = 0 | Written as 0 | ✗ No COGS (product was uncosted) |
| Product costPrice changed after sale | Old value preserved | ✓ Accurate (snapshot) |
| SaleRefundItem | Also captures `costPrice` from Product at exchange time | ✓ |

### COGS calculation

```
COGS per SaleItem = SaleItem.costPrice × SaleItem.quantity
```

If `SaleItem.costPrice = 0`, COGS for that line is zero. The journal must skip a zero-amount line (or flag the sale as "partially uncosted").

### No average cost / FIFO / LIFO

FixITPro uses a simple snapshot cost model. There is no WeightedAverageCost or FIFO tracking at the inventory layer.

---

## 8. Integration Options

### Option A — JournalService inside the POS transaction

Call `JournalService.create()` inside the existing `prisma.$transaction`, after the sale and stock steps.

| Factor | Assessment |
|--------|-----------|
| **Consistency** | Perfect — sale and journal are atomic |
| **POS risk** | **HIGH** — any accounting failure rolls back the entire sale |
| **AccountingAccount requirement** | All accounts must exist for every tenant or sale fails |
| **Lock time** | Longer — journal writes add latency inside the transaction |
| **Duplicate risk** | None — same transaction |
| **Rollback** | Automatic (sale rollback also rolls back journal) |
| **Complexity** | Low (one call per payment leg) |
| **ACCOUNTING_CORE_ENABLED gate** | Required — must skip if accounting not configured |
| **Verdict** | ✗ Not recommended — too much POS risk |

### Option B — Accounting Adapter after sale committed

After `await this.prisma.$transaction(...)` resolves, call `JournalService.create()` in a try/catch. The sale is already committed. Accounting failure is logged but the POS response is always returned.

| Factor | Assessment |
|--------|-----------|
| **Consistency** | Eventual — sale committed, journal may lag by <1ms |
| **POS risk** | **LOW** — sale is never affected by accounting failure |
| **AccountingAccount requirement** | If missing → logged error, sale still succeeds |
| **Lock time** | Zero impact on POS transaction |
| **Duplicate risk** | Low — `sourceId=SalePayment.id` + Phase 4A.1 partial unique index |
| **Rollback** | Manual reconciliation if journal fails after sale commits |
| **Complexity** | Low (dedicated `SalesAccountingAdapter` service) |
| **ACCOUNTING_CORE_ENABLED gate** | Easy to add at adapter level |
| **Verdict** | ✓ **Recommended** for Phase 4B.1 |

### Option C — Domain Event / Outbox Pattern

Write an `AccountingOutbox` row inside the POS transaction. A separate poller/worker reads the outbox and calls `JournalService`.

| Factor | Assessment |
|--------|-----------|
| **Consistency** | Guaranteed (transactional outbox) |
| **POS risk** | Zero |
| **Duplicate risk** | Zero (outbox is inside the POS tx) |
| **Rollback** | Outbox row rolls back with sale; at-least-once delivery by worker |
| **Complexity** | **HIGH** — requires new DB table, migration, polling worker |
| **Schema change** | Yes — `AccountingOutbox` model + migration |
| **Verdict** | ✗ Over-engineered for current phase |

### Option D — Async Job (Bull/BullMQ)

After sale committed, push a job to a Redis-backed Bull queue. A worker calls `JournalService`.

| Factor | Assessment |
|--------|-----------|
| **Consistency** | Eventual |
| **POS risk** | Zero |
| **Duplicate risk** | Bull's default job ID can prevent duplicates |
| **Infrastructure** | Requires Redis (already present) and Bull setup |
| **At-risk** | Server restart between commit and job enqueue = lost job |
| **Complexity** | Medium — new Bull module, processor, retry config |
| **Verdict** | ✗ Adds infrastructure without solving the key risk (between-commit gap) |

---

## 9. Recommended Integration Point

**Option B: `SalesAccountingAdapter` called after the POS transaction commits.**

### Why

1. POS reliability is never compromised — a misconfigured chart of accounts or any journal error cannot roll back a sale.
2. `SalePayment.id` is stable and unique — it becomes the `sourceId` for the journal. The Phase 4A.1 partial unique index (`sourceType + sourceId + tenantId`) prevents duplicate journals on retry.
3. `ACCOUNTING_CORE_ENABLED` flag gates the adapter — safe to deploy to production without activating.
4. No schema changes needed for Phase 4B.1.
5. The existing `AccountingService.record()` pattern (idempotency key, tx passthrough) demonstrates that the team is comfortable with this separation.

### Call site in SalesService.create()

```typescript
// AFTER the transaction:
const { sale } = result;

// Option B: post-commit accounting adapter (never throws back to POS)
if (this.configService.get('ACCOUNTING_CORE_ENABLED') === 'true') {
  await this.salesAccountingAdapter.recordSaleJournal(sale, tenantId, branchId).catch((err) => {
    this.logger.error(`SalesAccountingAdapter.recordSaleJournal failed for sale ${sale.id}`, err);
    // TODO Phase 4B.2: push to reconciliation queue
  });
}
```

### Similar call sites needed

| Flow | Adapter method |
|------|---------------|
| Sale create | `recordSaleJournal(sale, tenantId, branchId)` |
| Sale void | `reverseSaleJournal(sale, tenantId, branchId)` |
| Sale refund | `recordRefundJournal(saleRefund, sale, tenantId, branchId)` |

---

## 10. Failure Handling

### Failure scenarios and proposed handling

| Scenario | Effect | Mitigation |
|----------|--------|-----------|
| **POS success, Journal fails** | Sale committed, no journal | Log error with `sale.id`. Manual or automated reconciliation via `findBySource` re-run. |
| **POS transaction fails** | Sale rolled back, no journal attempted | Nothing to do — no journal call made. |
| **Double-click / duplicate POST** | POS transaction idempotency NOT built-in (no unique on Sale beyond receiptNumber) | Two Sale rows possible if frontend submits twice. But for accounting: `SalePayment.id` is different per sale → two journals created (one per sale). Accounting is correct if POS is correct. |
| **Network retry from frontend** | Same as double-click above | Same handling |
| **AccountingAccount missing for tenant** | Journal throws `NotFoundException` | Caught by `.catch()` in adapter — logged, sale unaffected |
| **Concurrent requests for same sale** | N/A — POS sale creation has no sourceId-based dedup | N/A |
| **Server restart between commit and adapter call** | Journal never created | Reconciliation job needed (Phase 4B.2) — compare `Sale.id` range vs `JournalEntry.sourceId` |
| **Redis failure** | No impact (no queue used in Option B) | N/A |
| **DB failure during journal** | Journal fails, `P2002` or other DB error | Caught by adapter `.catch()` — logged |
| **Void + Journal reversal, then void fails** | Void already rolled back (inside tx) — adapter NOT called if tx fails | Safe — adapter is only called after tx success |
| **Void success but reversal Journal fails** | Voided sale has no reversal journal | Log error; sale is correctly voided in POS, accounting needs manual reconciliation |

### No-throw contract for adapter

The `SalesAccountingAdapter` **must never throw** back to the POS layer. All methods must be internally wrapped:

```typescript
async recordSaleJournal(sale, tenantId, branchId): Promise<void> {
  try {
    // ... JournalService.create() calls
  } catch (err) {
    this.logger.error(`recordSaleJournal failed: saleId=${sale.id}`, err);
    // Future: push to reconciliation table
  }
}
```

---

## 11. Idempotency

### Per-payment-leg journal idempotency

Each `SalePayment` leg gets one journal entry. The idempotency key:

```
sourceType = 'SALE_PAYMENT'
sourceId   = SalePayment.id
tenantId   = from Sale.branch.tenantId
```

This maps directly to the Phase 4A.1 partial unique index:
```sql
"JournalEntry_sourceType_sourceId_tenantId_unique"
ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
```

If the adapter is called twice for the same `SalePayment.id` (e.g., server restart + reconciliation replay):
1. App-level `findBySource` check returns existing entry → `{ created: false }` (no duplicate)
2. If concurrent: DB-level P2002 → service catches and re-fetches → `{ created: false }`

### COGS journal idempotency

```
sourceType = 'SALE_COGS'
sourceId   = SaleItem.id       (one journal per SaleItem)
tenantId   = from Sale.branch.tenantId
```

### Void reversal idempotency

```
sourceType = 'JOURNAL_REVERSAL'
sourceId   = originalJournalEntry.id
tenantId   = from Sale.branch.tenantId
```

This uses the existing reversal mechanism from Phase 4A (`JournalService.reverse()`).

### Risk: SalePayment.id reuse

`SalePayment` has `onDelete: Cascade` — if `Sale` is deleted, `SalePayment` rows are deleted. Then a new sale could reuse a CUID from the deleted payment (extremely unlikely with CUID v1 collision probability). This risk is negligible in practice.

---

## 12. Tenant Isolation

### Sale model has NO tenantId column

`Sale` is scoped to a tenant only via its `Branch`:
```
Sale.branchId → Branch.tenantId
```

For sales with `branchId = null` (tenant-level sales created without a branch), there is no direct tenant link on the Sale row itself.

### Impact on accounting

To create a journal for a sale, the adapter must resolve `tenantId`:

```typescript
const tenantId = sale.branch?.tenantId
  ?? (await this.prisma.branch.findUnique({ where: { id: sale.branchId }, select: { tenantId: true } }))?.tenantId;
```

For `branchId = null` sales: `tenantId` must come from the authenticated user's JWT (passed as parameter). Cannot be derived from Sale alone.

### SalePayment: no tenantId or branchId

`SalePayment` carries only `saleId`. The adapter must join to Sale → Branch → tenantId before creating a journal with that payment's `sourceId`.

### Multi-tenant cross-check

| Relationship | Isolation verified by |
|---|---|
| Sale → AccountingAccount | `tenantId` match enforced in `JournalService.resolveAccounts()` |
| SalePayment → Journal | `tenantId` passed from Sale.branch.tenantId |
| Branch → AccountingAccount | `AccountingAccount.tenantId` must equal `Sale.branch.tenantId` |

No cross-tenant accounting is possible as long as the adapter derives `tenantId` from `Sale.branch.tenantId`, not from the JWT (which could be `SUPER_ADMIN` with access to all tenants).

---

## 13. Journal Mapping

Proposed journal entries based on actual POS data fields. These are recommendations for Phase 4B.1 — not implemented yet.

### 13.1 Sale — CASH payment

```
For each SalePayment where paymentMethod = 'CASH':
  DR 1100  Cash on Hand          Sale.total  (net, not SalePayment.amount — see §14.1)
  CR 4100  Sales Revenue         Sale.total
```

### 13.2 Sale — TRANSFER or CARD payment

```
For each SalePayment where paymentMethod IN ('TRANSFER', 'CARD'):
  DR 1120  Bank / Transfer Clearing   payment.amount
  CR 4100  Sales Revenue              payment.amount
```

> Note: TRANSFER/CARD `payment.amount` equals the revenue share for that leg (no change for non-cash). So `SalePayment.amount` is correct here (unlike CASH — see §14.1).

### 13.3 COGS (per SaleItem where costPrice > 0)

```
For each SaleItem where costPrice > 0:
  DR 5100  Cost of Goods Sold    (quantity × costPrice)
  CR 1300  Inventory             (quantity × costPrice)
```

If `costPrice = 0`: skip the COGS lines for that item (product was uncosted). Log as a warning.

### 13.4 Sale Void (reversal of 13.1/13.2)

Use `JournalService.reverse(originalJournalId)` which:
- Swaps all debit/credit lines
- Links via `sourceType='JOURNAL_REVERSAL'`, `sourceId=originalEntry.id`

### 13.5 Sale Refund (partial)

```
For refunded amount:
  DR 4100  Sales Revenue              totalRefund
  CR 1100  Cash on Hand               totalRefund  (if paymentMethod=CASH)
  -- or --
  CR 1120  Bank / Transfer Clearing   totalRefund  (if TRANSFER/CARD)

COGS reversal per returned SaleItem:
  DR 1300  Inventory                  (qty × costPrice)
  CR 5100  COGS                       (qty × costPrice)
```

### 13.6 Account code mapping (proposed, from Phase 3 chart of accounts)

| Account | Code | Type |
|---------|------|------|
| Cash on Hand | 1100 | Asset |
| Bank / Clearing | 1120 | Asset |
| Inventory | 1300 | Asset |
| Sales Revenue | 4100 | Revenue |
| Cost of Goods Sold | 5100 | Expense |

Actual account codes depend on the `AccountingAccount` rows initialized for each tenant (Phase 3 `AccountingAccountsService.initializeTenant()`).

---

## 14. Data Gaps

### 14.1 SalePayment.amount vs Net Cash

**Problem:** When a customer pays `500 THB` cash for a `450 THB` total, the system records:
- `SalePayment.amount = 500` (tendered)
- `Sale.change = 50`
- `Sale.total = 450`
- `CashDrawerTransaction.amount = 500`

For a multi-leg split (CASH 200 + TRANSFER 250, total 450, change 0), each leg amount IS the net revenue share.

For a single-leg CASH payment with change, the revenue journal should use `Sale.total`, not `SalePayment.amount`.

**Resolution:** Journal debit for CASH = `min(SalePayment.amount, Sale.total − sum(non_cash_legs))`. In practice, for single-payment-method sales, use `Sale.total`. For split, use `leg.amount` for non-CASH legs and `Sale.total − non_cash_total` for the CASH leg.

### 14.2 Sale has no tenantId

`Sale` does not have a direct `tenantId` column. The adapter must join via `Branch.tenantId`. For `branchId = null` sales, `tenantId` must come from the controller/JWT context and be passed into the adapter.

### 14.3 SalePayment has no tenantId or branchId

These must be resolved from the parent Sale. The adapter must eagerly load `Sale.branch.tenantId` and `Sale.branchId` when building journal inputs.

### 14.4 No tax / VAT capture

`Sale` has no tax or VAT fields. If the business charges VAT in the future, the journal mapping will not be able to separate revenue from tax payable without a schema change to Sale.

### 14.5 Products with costPrice = 0

`SaleItem.costPrice @default(0)`. If a product was never assigned a cost price, COGS = 0. The adapter must either skip COGS for zero-cost items or flag them separately. Inventory value will be understated for uncosted products.

### 14.6 No inventory account balance

`AccountingAccount.balance` (or any running balance) does not exist in the schema. The inventory account (1300) in the chart of accounts starts at zero. Journal entries will create a ledger for future inventory movements, but historical stock value is not captured.

### 14.7 StockMovement has no tenantId

`StockMovement` is scoped only by `branchId`. This means tenantId for stock events must always be resolved via branch lookup.

### 14.8 Change not tracked as a separate line

There is no `CashDrawerTransaction` row for the change paid out. The CASH IN row is for the tendered amount. The change is implicit (`Sale.change`). For accounting, this means cash on hand is recorded as the tendered amount (500) but revenue is 450 — requiring careful net calculation in the adapter.

---

## 15. Risk Assessment

### Risks to POS (production impact)

| Risk | Probability | Severity | Mitigation |
|------|-------------|----------|-----------|
| Accounting failure rolls back sale | Zero (Option B) | Critical | Adapter never throws |
| Slow journal write blocks POS response | Zero (post-commit) | High | Adapter is async (post-tx) |
| AccountingAccount not set up → sale fails | Zero (Option B) | High | Caught in adapter |
| Bug in adapter crashes POS service | Low | Critical | Adapter in separate service, caught at call site |
| Wrong tenantId in journal | Medium | High | Derive from Sale.branch.tenantId, not JWT |

### Risks to Accounting

| Risk | Probability | Severity | Mitigation |
|------|-------------|----------|-----------|
| Sale committed, journal missing (server restart) | Low | Medium | Reconciliation job (Phase 4B.2) |
| Duplicate journal on retry | Low | High | Phase 4A.1 partial unique index + app-level check |
| COGS=0 for uncosted product | Medium | Low | Log warning, skip zero-cost lines |
| Wrong cash amount (tendered vs net) | Medium | Medium | Use Sale.total for CASH net calculation (§14.1) |
| Cross-tenant journal | Low | Critical | Always use Sale.branch.tenantId |
| Historical sales (89 existing) without journals | Certain | Low | No backfill in Phase 4B.1 — forward-only |

---

## 16. Proposed Phase 4B.1 Implementation Plan

**Scope:** POS sale → accounting journal wiring (forward-only, no backfill).  
**Prohibitions maintained:** No changes to Sale/SaleItem/SalePayment/StockMovement/CashDrawerTransaction models. No backfill. No ACCOUNTING_CORE_ENABLED in production until approved.

### Step 1 — Create `SalesAccountingAdapter` service

**New file:** `backend/src/sales/sales-accounting.adapter.ts`

Injected into `SalesService`. Methods:
- `recordSaleJournal(sale, payments, tenantId, branchId): Promise<void>` — one journal per payment leg (revenue) + one COGS journal per SaleItem with costPrice > 0
- `reverseSaleJournal(sale, tenantId, branchId): Promise<void>` — calls `JournalService.reverse()` for each existing sale journal
- `recordRefundJournal(refund, sale, tenantId, branchId): Promise<void>` — revenue reversal + COGS restore

All methods: internal try/catch, never throw.

### Step 2 — Add `JournalModule` to `SalesModule`

In `backend/src/sales/sales.module.ts`:
```typescript
imports: [..., JournalModule],
providers: [..., SalesAccountingAdapter],
```

### Step 3 — Wire adapter into SalesService (behind ACCOUNTING_CORE_ENABLED)

In `backend/src/sales/sales.service.ts`, after the `$transaction` resolves:
```typescript
if (process.env.ACCOUNTING_CORE_ENABLED === 'true') {
  await this.salesAccountingAdapter.recordSaleJournal(sale, tenantId, branchId).catch(this.logger.error);
}
```

Same pattern for void and refund.

### Step 4 — Handle CASH net amount

In the adapter:
```typescript
const nonCashTotal = sale.payments
  .filter(p => p.paymentMethod !== 'CASH')
  .reduce((sum, p) => sum.plus(p.amount), new Decimal(0));
const cashNetAmount = new Decimal(sale.total).minus(nonCashTotal);
```

Use `cashNetAmount` for the CASH journal debit (not `SalePayment.amount`).

### Step 5 — Tenant resolution

```typescript
const tenantId = sale.branch?.tenantId
  ?? (await this.prisma.branch.findUnique({ where: { id: sale.branchId }, select: { tenantId: true } }))?.tenantId;
```

Throw in adapter constructor if tenantId still null (cannot create journal without tenant).

### Step 6 — Write 20+ tests for `SalesAccountingAdapter`

- Cash sale journal
- Transfer sale journal
- Card sale journal
- Split payment journal
- COGS for items with costPrice > 0
- COGS skipped for costPrice = 0 items
- Void reversal
- Partial refund
- Idempotency (duplicate call → same journal, created=false)
- P2002 race (concurrent adapter calls)
- AccountingAccount missing → no throw, error logged
- `branchId = null` sale → error logged (cannot resolve tenantId)
- ACCOUNTING_CORE_ENABLED = false → adapter not called

### Step 7 — Document and stop

Create `docs/accounting/PHASE_4B1_SALES_WIRING.md` with:
- Architecture diagram
- Journal entries produced per sale type
- Unresolved gaps (historical backfill, VAT)
- Reconciliation plan (Phase 4B.2)

### Timeline

| Task | Effort estimate |
|------|----------------|
| SalesAccountingAdapter service | ~4h |
| Unit tests (20+) | ~3h |
| Integration with SalesModule | ~1h |
| Documentation | ~1h |
| Code review + STOP | — |
| Production deploy (separate approval) | — |

---

## STOPPED

This document is the output of a read-only audit.

**Nothing was modified.** No migrations, no code changes, no journals created.

Awaiting owner approval before proceeding to Phase 4B.1 implementation.

Do NOT:
- Enable `ACCOUNTING_CORE_ENABLED`
- Wire POS to JournalService
- Create any JournalEntry rows
- Backfill historical sales (89 existing Sale rows)
- Deploy any code changes
