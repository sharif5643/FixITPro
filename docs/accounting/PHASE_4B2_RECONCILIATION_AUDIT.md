# Phase 4B.2A — Reconciliation & Recovery Audit

**Type:** Read-only audit  
**Date:** 2026-08-18  
**Scope:** Reconciliation design, retry strategy, exchange/repair/expense accounting gaps, outbox analysis, feature flag strategy, pre-activation checklist  
**No code was modified.**

---

## 1. Current Accounting Flow

### Two distinct ledgers

| Ledger | Table | Managed by | Status |
|--------|-------|-----------|--------|
| Cash Drawer Ledger | `CashDrawerTransaction` | `AccountingService` | Active (in production) |
| Double-Entry Journal | `JournalEntry` + `JournalLine` | `JournalService` | Implemented; flag OFF |

**The two ledgers are independent.** `AccountingService` writes cash drawer entries synchronously inside the POS `$transaction`. `JournalService` is called by `SalesAccountingAdapter` post-commit, gated by `ACCOUNTING_CORE_ENABLED`.

### Current POS flow with adapter (flag OFF)

```
POST /sales
  └─ SalesService.create()
       └─ prisma.$transaction
            ├─ Sale.create
            ├─ SaleItem.createMany
            ├─ SalePayment.createMany
            ├─ BranchStock.updateMany (deduct)
            ├─ StockMovement.create
            ├─ SerialNumber.updateMany
            ├─ CashDrawerTransaction.create  ← AccountingService (cash drawer, IN TX)
            └─ AuditLog.create
       [COMMIT]
       └─ notifyLowStock()                  ← fire-and-forget
       └─ salesAccounting?.recordSaleJournal()  ← returns immediately (flag OFF)
  └─ return sale
```

### Current journal call sites (adapter)

| Trigger | Method called | When |
|---------|--------------|------|
| `SalesService.create()` | `recordSaleJournal()` | After POS transaction commits |
| `SalesService.voidSale()` | `reverseSaleJournal()` | After void transaction commits |
| `SalesService.refundSaleItems()` | `recordRefundJournal()` | After refund transaction commits |
| `SalesService.exchangeSaleItems()` | **NOT WIRED** | — (known gap) |

---

## 2. Missing Journal Detection

### Current reconciliation coverage

`ReconciliationService.runReport()` exists at `GET /reconciliation/report` and covers **cash drawer reconciliation only**. It checks eight things:

1. CASH sales without a `CashDrawerTransaction`
2. CASH repair final payments without a `CashDrawerTransaction`
3. CASH expenses without a `CashDrawerTransaction`
4. CASH debt payments without a `CashDrawerTransaction`
5. Orphaned `CashDrawerTransaction` rows (business record deleted)
6. Duplicate `CashDrawerTransaction` per reference
7. Post-close `CashDrawerTransaction` (timestamped after session.closedAt)
8. Unassigned `CashDrawerTransaction` (sessionId=null)

**This service does not touch `JournalEntry` at all.** A missing JournalEntry is invisible to the existing reconciliation.

### Required: journal reconciliation query

For each `Sale` created after accounting activation with `Sale.status IN (COMPLETED, PARTIAL_REFUND, REFUNDED)`:

#### Revenue journals expected (per SalePayment)

```sql
-- For each SalePayment (leg.id) of a completed sale:
SELECT sp.id AS expected_source_id
FROM "SalePayment" sp
JOIN "Sale" s ON s.id = sp."saleId"
WHERE s."createdAt" >= <activation_timestamp>
  AND s.status != 'VOIDED'
  AND NOT EXISTS (
    SELECT 1 FROM "JournalEntry" je
    WHERE je."sourceType" = 'SALE_PAYMENT'
      AND je."sourceId"   = sp.id
      AND je."tenantId"   = <tenant_id>
      AND je."isVoided"   = false
  )
```

#### COGS journals expected (per SaleItem where costPrice > 0)

```sql
SELECT si.id AS expected_source_id
FROM "SaleItem" si
JOIN "Sale" s ON s.id = si."saleId"
WHERE s."createdAt" >= <activation_timestamp>
  AND s.status != 'VOIDED'
  AND si."costPrice" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "JournalEntry" je
    WHERE je."sourceType" = 'SALE_COGS'
      AND je."sourceId"   = si.id
      AND je."tenantId"   = <tenant_id>
      AND je."isVoided"   = false
  )
```

#### Void reversal expected (per voided Sale)

```sql
-- For each SalePayment of a VOIDED sale, a non-voided JOURNAL_REVERSAL must exist
-- (sourceId = original SALE_PAYMENT JournalEntry.id — not queryable without the original journal)
-- Approach: find VOIDED sales where the SALE_PAYMENT journal still exists as non-reversed
```

### Journal status classification

| Status | Meaning |
|--------|---------|
| `POSTED` | All expected journals exist and are not voided |
| `MISSING_REVENUE` | One or more SALE_PAYMENT journals absent |
| `MISSING_COGS` | One or more SALE_COGS journals absent |
| `PARTIAL` | Some journals present, some missing |
| `VOID_MISSING` | Sale is VOIDED but JOURNAL_REVERSAL not found |
| `REFUND_MISSING` | SaleRefund exists but SALE_REFUND journal absent |
| `ERROR` | Journal exists but amount mismatches Sale data |

### Reconciliation scope note

`Sale` has no `tenantId` column. Tenant is resolved via `Sale.branchId → Branch.tenantId`. The reconciliation query must JOIN `Branch` to scope by tenant. This was identified in the Phase 4B.1A audit and the adapter already handles it by receiving `tenantId` as a parameter from the service layer.

---

## 3. Retry Design

### The safety problem

```
prisma.$transaction  → COMMIT ✓
recordSaleJournal()  → ERROR ✗ (JournalService NotFoundException — AccountingAccount not initialized)
```

The sale exists. No journal exists. The adapter logged an error. No automatic recovery.

### Safe retry requirements

A retry must be safe under all of:

| Scenario | Requirement |
|---------|-------------|
| Previous attempt succeeded (but caller didn't know) | Idempotency: return existing, no duplicate |
| Previous response timed out | Same — idempotent on P2002 |
| Server restarted mid-flight | Adapter picks up from queried state |
| Duplicate request (concurrent retry) | DB-level P2002 → adapter returns existing |
| Partial success (revenue journaled, COGS failed) | Per-item idempotency: each sourceId independently checked |

### Idempotency: already correct

The existing design handles all retry scenarios at the database level:

1. **App-level:** `JournalService.findBySource(sourceType, sourceId, tenantId)` returns existing before writing.
2. **DB-level:** `JournalEntry_sourceType_sourceId_tenantId_unique` partial index prevents duplicates under concurrent writes; P2002 caught and re-fetched.

The retry is therefore **call `recordSaleJournal()` again with the same sale object**. The idempotency layer handles all edge cases. No special retry state machine is needed.

### Retry flow

```
Detect: Sale X has no SALE_PAYMENT journal for SalePayment Y
  ↓
Load: Sale X with payments[] and items[]
Load: Branch.tenantId for Sale X
  ↓
Call: salesAccounting.recordSaleJournal(sale, tenantId, actorId)
  ↓
Journal.create():
  - findBySource → already exists? → return {created: false} ✓
  - DB insert → P2002? → re-fetch winner → return {created: false} ✓
  - New insert → {created: true} ✓
```

All three outcomes are safe. The retry is purely additive — no delete, no update of existing journals.

### What the adapter needs for a retry call

```typescript
// Minimum data to retry a sale journal:
const sale = await prisma.sale.findFirst({
  where: { id: saleId },
  include: {
    payments: true,  // SalePayment.id is the sourceId
    items: {
      select: { id: true, quantity: true, costPrice: true }  // SaleItem.id is the sourceId
    },
    branch: { select: { tenantId: true } },
  },
});
const tenantId = sale.branch.tenantId;
await salesAccounting.recordSaleJournal(sale as any, tenantId ?? '', retryActorId);
```

This is a read-only query against the existing schema — no schema changes needed for retry.

---

## 4. Exchange Design

### What `exchangeSaleItems()` actually does

`POST /sales/:id/exchange` is a single large `prisma.$transaction` that:

1. **Creates `SaleRefund`** — with `items[]` for returned goods
2. **Updates `SaleItem.refundedQty`** on returned items
3. **Restores stock** (`BranchStock.upsert` + `StockMovement` REFUND) for returned items
4. **Handles serial numbers** for returned items
5. **Updates original `Sale.status`** → `PARTIAL_REFUND` or `REFUNDED`
6. **Creates new `Sale`** (status: COMPLETED) with:
   - One `SalePayment` row (amount = `newTotal`, method = `dto.paymentMethod`)
   - One `SaleItem` row per new item (with costPrice snapshot from product at exchange time)
7. **Deducts stock** for new items
8. **Calls `AccountingService.record()`** twice (inside the transaction):
   - `SALE_REFUND OUT refund.id` = refundTotal
   - `SALE_PAYMENT IN newSale.id` = newTotal
   - **NOTE:** Uses `newSale.id` as sourceId for SALE_PAYMENT, not `SalePayment.id`. This differs from the standard POS adapter which uses `SalePayment.id`.

### Exchange example: journal structure

```
Original sale:         1,000 THB CASH
Original COGS:           700 THB
Exchange item:         1,200 THB CASH
New COGS:                800 THB
Net paid by customer:    200 THB
```

**Required journal entries:**

| # | sourceType | sourceId | DR | CR | Amount |
|---|-----------|---------|----|----|--------|
| 1 | `SALE_REFUND` | `refund.id` | 4100 Sales Revenue | 1100 Cash | 1,000 |
| 2 | `SALE_REFUND_COGS` | `${refund.id}:${saleItemId}` | 1300 Inventory | 5100 COGS | 700 |
| 3 | `SALE_PAYMENT` | `newSalePayment.id` | 1100 Cash | 4100 Sales Revenue | 1,200 |
| 4 | `SALE_COGS` | `newSaleItemId` | 5100 COGS | 1300 Inventory | 800 |

Net: Cash +200, Revenue +200, Inventory -100, COGS +100. Correct.

### Data gaps — exchange cannot be journaled yet

| Data needed | Available now? | Gap |
|------------|---------------|-----|
| `refund.id` | ✓ returned from tx | — |
| `refund.totalRefund` | ✓ | — |
| `refund.paymentMethod` | ✓ = `dto.paymentMethod` | — |
| `sale.items[].costPrice` (for COGS restore) | ✓ loaded before tx | — |
| `newSale.id` | ✓ returned from tx | — |
| `newSalePayment.id` | **✗** | `newSale` not returned with `include: { payments: true }` |
| `newSaleItem.id` per item | **✗** | `newSale` not returned with `include: { items: true }` |
| `products[].costPrice` for new items | ✓ loaded before tx | — |

**STOP — exchange journaling cannot proceed without these IDs.**

To resolve the gaps, `exchangeSaleItems()` must be modified to either:
- **Option A:** Re-fetch `newSale` with `payments` and `items` after the transaction commits (one extra query post-commit)
- **Option B:** Use a nested create and capture the returned IDs from `tx.salePayment.create(...)` explicitly within the transaction body instead of using Prisma nested write

Option A is simpler and avoids refactoring the existing transaction. The re-fetch is identical in structure to what `SalesService.create()` already does (the `sale` variable after commit contains items and payments via the `include` in `tx.sale.create(...)`).

**Exchange journal wiring is NOT recommended for Phase 4B.1. Defer to Phase 4B.2.**

The accountingService.record() call inside exchange currently uses `sourceId = newSale.id` for `SALE_PAYMENT` (cash drawer), while the journal adapter uses `sourceId = SalePayment.id`. These differ — the exchange and journal adapter use inconsistent sourceId for the same event type. This must be aligned in Phase 4B.2.

---

## 5. Repair Accounting Audit

### Current state (cash drawer)

All repair payment flows call `AccountingService.record()` inside `$transaction`. No `JournalService` calls.

| Payment event | sourceType | sourceId | direction | Within tx? |
|--------------|-----------|---------|----------|-----------|
| Create repair with deposit | `REPAIR_DEPOSIT` | `repair.id` | IN | ✓ |
| Final payment (processPayment) | `REPAIR_FINAL_PAYMENT` | `repair.id` | IN | ✓ |
| Additional payment (addAdditionalPayment) | `REPAIR_ADDITIONAL_PAYMENT` | `repairAdditionalPayment.id` | IN | ✓ |
| Payment reversal (reversePayment) | `REVERSAL` | `repair.id` | OUT | ✓ |
| Debt payment post-delivery (DebtPaymentsService) | `REPAIR_ADDITIONAL_PAYMENT` | `repairAdditionalPayment.id` | IN | ✓ |

### Accounting gaps (journal not wired)

**Repair accounting requires Chart of Account decisions not yet made:**

1. **Deposit journal**: Deposit received = liability until repair delivered
   - Approach A (simple): DR1100 Cash / CR4200 Repair Revenue (recognize immediately)
   - Approach B (accurate): DR1100 Cash / CR2100 Customer Deposits (defer revenue)
   - Approach B requires `2100 Customer Deposits` account code in Chart of Accounts — not currently defined

2. **Final payment journal**: If deposit deferred (Approach B), final payment must:
   - Release deposit: DR2100 Customer Deposits / CR4200 Repair Revenue
   - Record final payment: DR1100 Cash / CR4200 Repair Revenue
   - This is complex — requires knowing the original deposit amount from the same repair

3. **Additional payment journal**:
   - DR1100 (or DR1120) / CR4200 Repair Revenue (straightforward)

4. **Payment reversal journal**:
   - Reverse of the original final payment journal

5. **COGS for repair parts**: Repair parts (`RepairPart`) deduct stock via `BranchStock`. They have `costPrice` and `quantity`. A COGS entry per repair is feasible but requires scoping to the `DELIVERED` event — parts can be added/removed throughout the repair lifecycle before delivery.

**Recommendation:** Use Approach A (simple revenue recognition) for Phase 4B.2. Account code `4200 Repair Revenue` must be added to Chart of Accounts during initialization. Repair COGS can be deferred to Phase 4B.3.

### Repair accounting blocked on Chart of Accounts decision

No repair journal can be implemented until:
- `4200 Repair Revenue` account code is defined and seeded
- The deposit-deferral vs immediate-recognition decision is made by the owner

---

## 6. Expense Accounting Audit

### Current state (cash drawer)

`ExpensesService.create()` calls `AccountingService.record(sourceType: EXPENSE_PAYMENT, direction: OUT)` inside a `$transaction`.

`ExpensesService.voidExpense()` calls `AccountingService.record(sourceType: REVERSAL, direction: IN)` inside a `$transaction`.

No `JournalService` calls.

### Expense data model

| Field | Type | Notes |
|-------|------|-------|
| `amount` | Decimal | Amount paid |
| `paymentMethod` | String | CASH, TRANSFER, etc. |
| `categoryId` | FK → ExpenseCategory | `code` field: rent, utilities, salary, marketing, supplies, maintenance, shipping, misc |
| `branchId` | FK → Branch | Branch tenantId resolves tenant |
| `voidedAt` | DateTime? | null = active |
| `description` | String | Free text |

### Required journal mapping

| Expense category code | DR account | CR account |
|----------------------|-----------|-----------|
| `rent` | 6100 Rent Expense | 1100 Cash (or 1120 Clearing) |
| `utilities` | 6200 Utilities | 1100 / 1120 |
| `salary` | 6300 Salaries | 1100 / 1120 |
| `marketing` | 6400 Marketing | 1100 / 1120 |
| `supplies` | 6500 Office Supplies | 1100 / 1120 |
| `maintenance` | 6600 Maintenance | 1100 / 1120 |
| `shipping` | 6700 Shipping | 1100 / 1120 |
| `misc` | 6900 Other Expenses | 1100 / 1120 |

**These account codes (61xx–69xx) do not currently exist in the Chart of Accounts.** Adding them requires:
1. New account codes added to `AccountingAccountsService.initializeForTenant()`
2. A mapping table from `ExpenseCategory.code` → journal account code

### Expense void journal

```
DR 1100 Cash (or 1120)       expense.amount   ← money returned to drawer/bank
CR 6xxx Expense account       expense.amount   ← expense reduced
```

This is the reverse of the creation entry. Idempotent via `SALE_REFUND:expense.id` sourceId (need a new sourceType for expense void — e.g. `EXPENSE_REVERSAL`).

### Expense accounting blocked on

1. Account codes 61xx–69xx not yet initialized
2. Category-to-account-code mapping not yet designed
3. New sourceType constants needed: `EXPENSE_PAYMENT` (exists in AccountingService), `EXPENSE_REVERSAL` (needed for journal)

---

## 7. Outbox / Retry Infrastructure Analysis

### What exists

| Infrastructure | Status | Details |
|--------------|--------|---------|
| `ScheduleModule.forRoot()` | ✓ Active | NestJS built-in cron. Already used by `backup.service.ts` (@2AM) and `auth.service.ts` (@3AM) |
| Redis | ✓ Active | `redis.module.ts` — used for rate limiting / caching. NOT for job queues |
| BullMQ / Bull | ✗ Not installed | No `@nestjs/bull`, `bullmq`, or `ioredis` queue references in any `.ts` file |
| Outbox table | ✗ Not in schema | No `AccountingOutbox`, `JournalOutbox`, or similar model in `schema.prisma` |
| Retry table | ✗ Not in schema | — |
| Queue table | ✗ Not in schema | — |

### Option comparison

#### A. Scheduled reconciliation scan (recommended for Phase 4B.2)

```
@Cron('0 */15 * * * *')  // every 15 minutes
async reconcileJournals() {
  // 1. Find Sale rows where createdAt > activationDate AND status != VOIDED
  //    with SalePayment.id not in JournalEntry(sourceType=SALE_PAYMENT)
  // 2. For each: load full sale, call recordSaleJournal()
  // 3. Log result
}
```

| Criterion | Assessment |
|-----------|-----------|
| Reliability | High — catches any missed event within 15 min |
| Complexity | Low — uses existing ScheduleModule + adapter |
| Production risk | Low — scan is read-only, retry is idempotent |
| Duplicate handling | Handled by existing P2002 + findBySource idempotency |
| Operational burden | Low — logs tell you what was recovered |
| Schema change needed | No |
| Infrastructure needed | None new |

**Window of inconsistency:** up to 15 minutes after a failure. Acceptable for accounting (not real-time).

#### B. Outbox table (reliable but requires migration)

Pattern: write to `AccountingOutbox` atomically inside the POS transaction, then a worker processes the outbox and calls the adapter.

| Criterion | Assessment |
|-----------|-----------|
| Reliability | Very high — at-least-once delivery guaranteed |
| Complexity | High — new table, worker, state machine, cleanup |
| Production risk | Medium — requires migration |
| Duplicate handling | Handled by outbox status + idempotency layer |
| Operational burden | Medium — must monitor outbox queue depth |
| Schema change needed | Yes — new `AccountingOutbox` table |
| Infrastructure needed | Worker service |

**Concern:** This couples the outbox write to the POS transaction — schema migration must precede deployment. Migration risk.

#### C. BullMQ Queue (reliability without schema change)

| Criterion | Assessment |
|-----------|-----------|
| Reliability | High — Redis-backed persistence |
| Complexity | High — new package, worker, queue config |
| Production risk | Medium-high — Redis not currently used as message broker; needs persistence config |
| Duplicate handling | Via job deduplication or adapter idempotency |
| Schema change needed | No |
| Infrastructure needed | Install BullMQ, configure Redis AOF/persistence |
| Operational burden | High — monitor queue depth + Redis health |

Redis is currently used for rate limiting only. Using it as a durable message broker requires enabling AOF persistence — current Redis config not verified for durability.

#### D. Hybrid: scan + outbox (Phase 4B.3+)

Start with scan (Phase 4B.2). Add outbox later if scan proves insufficient (high volume, tight consistency requirements).

### Recommendation

**Phase 4B.2: Implement Option A (scheduled scan).**

Rationale:
- Uses existing `ScheduleModule` — no new infrastructure
- Zero schema migration risk
- Idempotency already implemented (Phase 4A.1 + Phase 4B.1)
- Recovery window (≤15 min) is acceptable for double-entry accounting
- Can be upgraded to outbox in Phase 4B.3 if needed

**Scan implementation scope:**

New `AccountingReconciliationService` with:
1. `@Cron('0 */15 * * * *')` method
2. Finds Sales with missing SALE_PAYMENT journals (created after activation flag was enabled)
3. Calls existing `SalesAccountingAdapter.recordSaleJournal()` for each
4. Writes to existing `AuditLog` for each recovery action

---

## 8. Feature Flag Strategy

### Current state: global env var

```
ACCOUNTING_CORE_ENABLED=true  →  ALL tenants get journals
ACCOUNTING_CORE_ENABLED=false →  NO tenants get journals
```

### Requirements for a pilot (single tenant first)

To safely activate for one tenant and observe before rolling out to all:

- **Tenant A (pilot):** journals ON
- **Tenant B, C, D:** journals OFF

The current global flag cannot support this.

### Option A: Tenant-level DB flag (accurate, requires migration)

Add `accountingEnabled Boolean @default(false)` to `Tenant` model:

```sql
ALTER TABLE "Tenant" ADD COLUMN "accountingEnabled" BOOLEAN NOT NULL DEFAULT false;
```

Then the adapter checks:
```typescript
const tenant = await this.prisma.tenant.findUnique({
  where:  { id: tenantId },
  select: { accountingEnabled: true },
});
if (!tenant?.accountingEnabled) return;
```

| Criterion | Assessment |
|-----------|-----------|
| Accuracy | Exact — per-tenant control |
| Migration risk | Low — adding nullable/default column |
| Operational burden | Low — toggle via admin UI or SQL |
| Schema change | Yes |

### Option B: Env-var allowlist (no schema change)

```
ACCOUNTING_ENABLED_TENANTS=tenant-id-1,tenant-id-2
```

Adapter checks:
```typescript
const allowed = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').split(',').map(s => s.trim());
if (!allowed.includes(tenantId)) return;
```

| Criterion | Assessment |
|-----------|-----------|
| Accuracy | Per-tenant via env — requires restart to change |
| Migration risk | None |
| Schema change | None |
| Operational burden | Medium — env change requires redeploy/restart |

### Recommendation

**Phase 4B.2: Use Option B (env allowlist) for the pilot.**

Rationale: No schema migration needed. Can activate one tenant ID in the allowlist while keeping the global flag OFF. After pilot validates, switch to Option A (DB flag) in Phase 4B.3.

**Pilot strategy:**
1. Deploy Phase 4B.1 code to production (flag OFF)
2. Initialize Chart of Accounts for pilot tenant (Phase 3 step)
3. Set `ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>` in Coolify env
4. Restart backend container (no migration)
5. Monitor for 7 days
6. If clean, set `ACCOUNTING_CORE_ENABLED=true` and remove allowlist

---

## 9. Pilot Strategy

### Prerequisites before ANY tenant goes live

1. **Chart of Accounts initialized** for pilot tenant — accounts 1100, 1120, 1300, 4100, 5100 must exist and be active
2. **Phase 4B.1 code deployed** to production (with flag OFF)
3. **All 308 tests pass** in CI
4. **Production DB backup** taken and restore verified
5. **Reconciliation endpoint** returns clean report for pilot tenant (`GET /reconciliation/report`)
6. **Activation timestamp** recorded — needed as the `createdAt >=` filter in the reconciliation scan

### Pilot timeline (suggested)

| Day | Action |
|-----|--------|
| 0 | Deploy Phase 4B.1. Backup. Confirm flag OFF. |
| 1 | Initialize CoA for pilot tenant. |
| 2 | Set `ACCOUNTING_ENABLED_TENANTS=<pilot_id>`. Restart. |
| 2 | Create 3 test sales (CASH, TRANSFER, split). Verify JournalEntry rows. |
| 2–9 | Monitor error logs for `recordSaleJournal failed`. |
| 9 | Run reconciliation scan manually. Confirm 0 missing journals. |
| 10 | Owner approves full rollout. |
| 10 | Set `ACCOUNTING_CORE_ENABLED=true`. Remove allowlist. Restart. |

---

## 10. Failure Scenarios

### Scenario 1: Journal service fails at account resolution

```
POS sale commits ✓
recordSaleJournal() → NotFoundException: account "1100" not found for tenant
  → adapter catches, logs error
  → JournalEntry NOT created
```

**Detection:** Scheduled scan finds Sale with missing SALE_PAYMENT journal.  
**Recovery:** Initialize Chart of Accounts for tenant, then retry scan.

### Scenario 2: Server restart between commit and adapter call

```
prisma.$transaction → COMMIT ✓
[server restart]
recordSaleJournal() → never called
```

**Detection:** Scheduled scan.  
**Recovery:** Scan retries — idempotent.

### Scenario 3: Concurrent duplicate retry

```
Scan finds missing journal for Sale X
  → Calls recordSaleJournal() (attempt 1)
  → Calls recordSaleJournal() (attempt 2, concurrent)
Both call JournalService.create() with same sourceType+sourceId
  → One wins, one gets P2002
  → P2002 handled: re-fetch winner, return {created: false}
```

**Detection:** No duplicate created.  
**Recovery:** Automatic via idempotency.

### Scenario 4: Void committed, reversal journal failed

```
voidSale() → prisma.$transaction COMMIT ✓ (Sale.status = VOIDED)
reverseSaleJournal() → JournalService throws
  → adapter catches, logs error
  → Original SALE_PAYMENT journal NOT reversed
```

**Detection:** Voided sale still has non-voided `SALE_PAYMENT` journal.  
**Recovery:** Manual reversal via `POST /journals/:id/reverse` (already implemented in JournalService). The scan must also cover VOID_MISSING status.

### Scenario 5: Partial COGS failure

```
SALE_PAYMENT journal created ✓
SALE_COGS journal fails (item.id resolution error)
  → loop continues to next item
```

**Detection:** Sale has SALE_PAYMENT journal but no SALE_COGS for one item.  
**Recovery:** Retry — only the missing COGS will be written (findBySource skips existing SALE_PAYMENT).

### Scenario 6: AccountingAccount not initialized

Phase 3 initialization must be run for each tenant before enabling. If missed:
```
recordSaleJournal() → NotFoundException: account "1100" not found
```
Every sale from that tenant produces an error log. Scan finds all missing journals.  
**Recovery:** Run tenant initialization, then trigger reconciliation scan manually.

### Scenario 7: Zero-cost items excluded (expected behavior)

Sales containing items where `SaleItem.costPrice = 0`:
- No SALE_COGS journal is created (by design)
- Scan must NOT flag these as missing COGS
- Filter: `si.costPrice > 0` in the missing-COGS detection query

---

## 11. Recovery Procedures

### Manual journal retry for a specific sale

```typescript
// Via admin endpoint (to be added in Phase 4B.2)
POST /admin/accounting/retry-sale/:saleId

// Internal:
const sale = await prisma.sale.findFirst({
  where: { id: saleId },
  include: { payments: true, items: true, branch: { select: { tenantId: true } } },
});
await salesAccountingAdapter.recordSaleJournal(sale, sale.branch.tenantId, adminActorId);
```

### Manual void reversal

```typescript
// If Sale is VOIDED but journal not reversed:
POST /journals/:journalEntryId/reverse
{ reason: "Void reconciliation — Sale {receiptNumber}" }
```

`JournalService.reverse()` is already implemented. The admin must look up the original `SALE_PAYMENT` journal entry ID first.

### Bulk scan trigger

```typescript
// Trigger the scheduled scan on-demand (to be added):
POST /admin/accounting/run-reconciliation
```

### Chart of Accounts initialization

```typescript
// For a new tenant — must run before enabling accounting:
POST /accounting-accounts/initialize
// Already implemented in AccountingAccountsService.initializeForTenant()
```

---

## 12. Production Readiness Checklist

### Before deploying Phase 4B.1 code

- [ ] Production DB backup taken
- [ ] Backup restore tested (restore to staging, verify data)
- [ ] All 308 tests pass in CI (`npx jest --no-coverage`)
- [ ] `ACCOUNTING_CORE_ENABLED` confirmed absent from all production env files
- [ ] `ACCOUNTING_ENABLED_TENANTS` absent from production env (will be set at pilot time)
- [ ] Docker image build succeeds

### After deploying Phase 4B.1 (before any activation)

- [ ] Server boots without error
- [ ] `GET /health` returns 200
- [ ] POS creates a test sale — verify it completes normally
- [ ] Verify `JournalEntry` count = 0 (flag is OFF)
- [ ] Verify existing `GET /reconciliation/report` still works

### Before activating for pilot tenant

- [ ] Chart of Accounts initialized for pilot tenant:
  - Account 1100 (Cash on Hand) — active
  - Account 1120 (Bank/Transfer Clearing) — active
  - Account 1300 (Inventory) — active
  - Account 4100 (Sales Revenue) — active
  - Account 5100 (Cost of Goods Sold) — active
- [ ] Activation timestamp recorded (= the moment `ACCOUNTING_ENABLED_TENANTS` is set)
- [ ] Pilot tenant selected and informed
- [ ] Reconciliation scan endpoint (Phase 4B.2) deployed
- [ ] Error monitoring active (check logs for `recordSaleJournal failed`)

### Rollback plan

**Immediate (no redeploy):** Remove `ACCOUNTING_CORE_ENABLED` and `ACCOUNTING_ENABLED_TENANTS` from Coolify env, restart container. Adapter returns immediately at `isEnabled` check. No POS impact.

**Code rollback:** Revert 5 files (see `PHASE_4B1_SALES_WIRING.md` § Rollback Procedure). Existing `JournalEntry` rows are inert — they don't affect POS, cash drawer, or any business data.

---

## 13. Risks

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Post-commit failure leaves sale without journal | Low-Medium | Low (audit gap only, POS unaffected) | Scheduled reconciliation scan recovers |
| Chart of Accounts not initialized → every sale fails accounting | Medium (operator error) | Low (POS unaffected) | Checklist gates activation |
| Exchange creates journals with wrong sourceId | High (if attempted without fix) | Medium (duplicate journals) | Block exchange wiring until Phase 4B.2 |
| Repair journal double-counts deposit | High (if Approach B chosen without careful design) | High (incorrect P&L) | Use Approach A (immediate recognition) in Phase 4B.2 |
| SUPER_ADMIN sale with null tenantId → no journal | Low (SUPER_ADMIN rarely creates POS sales) | Low | Known; logged as warning |
| Redis AOF not configured → BullMQ jobs lost on restart | N/A — BullMQ not chosen | — | — |
| Global flag enables accounting for unprepared tenants | Medium | High | Use allowlist, not global flag, for pilot |
| Scan retries a void reversal that already succeeded | Low | Low | P2002 idempotency handles it |

---

## 14. Recommended Implementation Order

### Phase 4B.2 — Wiring & Reconciliation

1. **Deploy Phase 4B.1 to production** (flag OFF) — enables the adapter code in production
2. **Initialize Chart of Accounts** for pilot tenant
3. **Implement `AccountingReconciliationService`** (scheduled scan):
   - `@Cron` every 15 minutes
   - Queries for missing SALE_PAYMENT / SALE_COGS journals since activation
   - Calls `SalesAccountingAdapter` for recovery
   - Writes to `AuditLog`
4. **Add admin endpoint** `POST /admin/accounting/retry-sale/:saleId`
5. **Implement tenant allowlist** (`ACCOUNTING_ENABLED_TENANTS` env var check)
6. **Pilot activation** — one tenant, 7-day observation
7. **Full rollout** — global flag ON

### Phase 4B.3 — Repair & Expense wiring

1. **Decide: deposit accounting approach** (immediate vs deferred revenue)
2. **Add account codes** for repair and expense (42xx, 61xx–69xx)
3. **Add expense category → account code mapping**
4. **Implement `RepairAccountingAdapter`** (analogous to SalesAccountingAdapter)
5. **Implement `ExpenseAccountingAdapter`**
6. **Add repair & expense to reconciliation scan**

### Phase 4B.4 — Exchange wiring

1. **Modify `exchangeSaleItems()`** to re-fetch new sale with payments+items after tx
2. **Wire `recordRefundJournal()`** for the exchange refund side
3. **Wire `recordSaleJournal()`** for the new exchange sale
4. **Add exchange sourceId alignment** (use `newSalePayment.id`, not `newSale.id`)
5. **Add exchange to reconciliation scan**

### Phase 4B.5 — Outbox upgrade (optional)

Only if scan-based reconciliation proves insufficient at scale. Evaluate after 3 months of production data.

---

## STOPPED

Not proceeding to Phase 4B.2 implementation.

**Awaiting owner approval to:**
- Deploy Phase 4B.1 to production (91.98.151.10)
- Implement Phase 4B.2 (reconciliation scan, retry endpoint, tenant allowlist)
- Activate accounting for pilot tenant
- Proceed to Phase 4B.3 (repair/expense wiring)
