# Phase 4B.1 — POS Sales Accounting Integration

**Status:** COMPLETE — NOT YET ENABLED IN PRODUCTION  
**Date:** 2026-08-18  
**Feature flag:** `ACCOUNTING_CORE_ENABLED` — must be `false` in production  
**No production JournalEntry rows created**

---

## 1. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  POS Request (POST /sales)                                      │
└──────────────────────────────┬──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│  SalesService.create()                                          │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  prisma.$transaction  ← UNCHANGED POS transaction       │   │
│  │                                                         │   │
│  │  Sale.create + SaleItems + SalePayments                 │   │
│  │  BranchStock.updateMany (atomic deduct)                 │   │
│  │  StockMovement.create                                   │   │
│  │  SerialNumber.updateMany                                │   │
│  │  CashDrawerTransaction.create (via AccountingService)   │   │
│  │  AuditLog.create                                        │   │
│  └─────────────────────────────────────────────────────────┘   │
│       │  COMMIT                                                 │
│       ▼                                                         │
│  notifyLowStock() — post-tx, fire-and-forget                    │
│       │                                                         │
│       ▼                                                         │
│  salesAccounting?.recordSaleJournal()  ←── NEW (post-commit)   │
│       │  try/catch — NEVER throws back to POS                   │
│       ▼                                                         │
│  return sale  ← identical to pre-Phase-4B.1 behavior           │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              SalesAccountingAdapter (new service)
              ├── JournalService.create() × N payment legs
              └── JournalService.create() × M COGS items
```

### Key design principle

**The adapter is completely isolated from the POS transaction.** It runs post-commit. If accounting fails, the sale has already committed. The customer receives a successful response. Accounting failures are logged for reconciliation; they never affect POS reliability.

---

## 2. Files Changed

| File | Change |
|------|--------|
| `backend/src/sales/sales-accounting.adapter.ts` | **NEW** — SalesAccountingAdapter service |
| `backend/src/sales/sales-accounting.adapter.spec.ts` | **NEW** — 28 adapter unit tests |
| `backend/src/sales/sales.module.ts` | Added `JournalModule` import + `SalesAccountingAdapter` provider |
| `backend/src/sales/sales.service.ts` | Added adapter injection + 3 post-commit calls |
| `backend/src/sales/sales.workflow.spec.ts` | Added `SalesAccountingAdapter` mock to TestingModule |
| `docs/accounting/PHASE_4B1_SALES_WIRING.md` | **NEW** — this document |

---

## 3. Feature Flag Behavior

| `ACCOUNTING_CORE_ENABLED` | Behavior |
|--------------------------|----------|
| `false` (default/absent) | Adapter methods return immediately. Zero journal queries run. POS behavior exactly identical to pre-Phase-4B.1. |
| `true` | Adapter creates journal entries post-commit for each new sale, void, and refund. |

The flag is checked at call time (not at startup), so it can be toggled without restart. However, changing it mid-session while active sales are being processed may leave some sales without journals during the transition — enable it only at a quiet time.

**To enable in production (when approved):**
```bash
# In backend container environment / Coolify env vars:
ACCOUNTING_CORE_ENABLED=true
```

---

## 4. Journal Mapping

### 4.1 Sale — CASH payment

```
DR  1100  Cash on Hand          Sale.total (net, change-adjusted)
CR  4100  Sales Revenue         Sale.total
```

`sourceType = 'SALE_PAYMENT'`, `sourceId = SalePayment.id`

### 4.2 Sale — TRANSFER or CARD payment

```
DR  1120  Bank / Transfer Clearing   SalePayment.amount
CR  4100  Sales Revenue              SalePayment.amount
```

### 4.3 COGS (per SaleItem where costPrice > 0)

```
DR  5100  Cost of Goods Sold    quantity × SaleItem.costPrice
CR  1300  Inventory             quantity × SaleItem.costPrice
```

`sourceType = 'SALE_COGS'`, `sourceId = SaleItem.id`

### 4.4 Sale Void (reversal)

`JournalService.reverse()` is called for each existing journal (SALE_PAYMENT + SALE_COGS). Reversal flips all debit↔credit and links via:
```
sourceType = 'JOURNAL_REVERSAL'
sourceId   = original JournalEntry.id
```

### 4.5 Refund — revenue reversal

```
DR  4100  Sales Revenue         SaleRefund.totalRefund
CR  1100  Cash on Hand          (CASH refund)
  or
CR  1120  Clearing              (TRANSFER/CARD refund)
```

`sourceType = 'SALE_REFUND'`, `sourceId = SaleRefund.id`

### 4.6 Refund — COGS restore (per refunded SaleItem)

```
DR  1300  Inventory             quantity × SaleItem.costPrice
CR  5100  COGS                  quantity × SaleItem.costPrice
```

`sourceType = 'SALE_REFUND_COGS'`, `sourceId = '<refundId>:<saleItemId>'`

---

## 5. Cash / Change Calculation

**Problem:** When a customer tenders 500 THB for a 450 THB sale, the POS stores `SalePayment.amount = 500` (tendered) and `Sale.change = 50`. Revenue is 450. If we used `SalePayment.amount`, the journal would overstate revenue by 50.

**Solution:** For CASH legs, the journal uses the net amount:
```
cashNetAmount = Sale.total − sum(non-CASH legs' amounts)
```

For split payments (e.g. CASH 200 + TRANSFER 250, total 450):
- CASH journal: DR 1100 = **200** (net cash, no change in this case)
- TRANSFER journal: DR 1120 = **250** (payment.amount, no change on non-cash)

For multiple CASH legs (rare): `cashNetAmount` is distributed proportionally by each leg's tendered amount.

`SalePayment.amount` is never modified. `CashDrawerTransaction.amount` is never modified.

---

## 6. COGS Behavior

| Scenario | Action |
|----------|--------|
| `SaleItem.costPrice > 0` | COGS journal created (DR 5100, CR 1300) |
| `SaleItem.costPrice = 0` | COGS journal **skipped**; warning logged |
| Multiple items in one sale | One COGS journal per item |
| Void | COGS journal reversed via `JournalService.reverse()` |
| Refund (partial) | COGS restore journal created for returned items only |

**Why costPrice can be zero:** `SaleItem.costPrice` defaults to `Product.costPrice` at time of sale. If the product was never assigned a cost price, it will be 0. The adapter logs a warning per uncosted item but continues — accounting for the rest of the sale is unaffected.

---

## 7. Tenant Isolation

`Sale` does not have a `tenantId` column. The `tenantId` passed to the adapter comes from the `SalesService` call chain, which gets it from the JWT via the controller. For non-SUPER_ADMIN users, this equals `Branch.tenantId`.

All `JournalService.create()` calls receive the same `tenantId`. `JournalService.resolveAccounts()` validates that all `AccountingAccount` records belong to this tenant — cross-tenant journal creation is impossible.

For `branchId = null` sales (tenant-level, no branch), the adapter creates journals with `branchId = null`. The journal is still tenant-scoped via `tenantId`. ✓

---

## 8. Idempotency

| sourceType | sourceId | Uniqueness guarantee |
|-----------|---------|---------------------|
| `SALE_PAYMENT` | `SalePayment.id` | 1 journal per payment leg (unique cuid) |
| `SALE_COGS` | `SaleItem.id` | 1 COGS journal per sale item |
| `SALE_REFUND` | `SaleRefund.id` | 1 journal per refund |
| `SALE_REFUND_COGS` | `<refundId>:<saleItemId>` | 1 reversal per refunded item |
| `JOURNAL_REVERSAL` | `originalJournalEntry.id` | 1 reversal per original journal |

The Phase 4A.1 partial unique index enforces DB-level idempotency:
```sql
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
  ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

If the adapter is called twice (e.g. server restart then reconciliation):
- App-level: `JournalService.findBySource()` returns existing → `{ created: false }`
- DB-level (concurrent): P2002 caught → re-fetch winner → `{ created: false }`

No duplicate journals in any scenario.

---

## 9. Failure Handling

### No-throw contract

All three public adapter methods (`recordSaleJournal`, `reverseSaleJournal`, `recordRefundJournal`) wrap their implementation in try/catch and **never propagate accounting errors back to the POS caller.**

```typescript
async recordSaleJournal(sale, tenantId, actorId): Promise<void> {
  if (!this.isEnabled) return;
  try {
    await this._recordSaleJournal(sale, tenantId, actorId);
  } catch (err) {
    this.logger.error(`recordSaleJournal failed: saleId=${sale.id}`, err);
    // TODO Phase 4B.2: push to reconciliation outbox
  }
}
```

### Failure scenarios

| Scenario | Outcome |
|----------|---------|
| AccountingAccount not initialized for tenant | NotFoundException caught; journal skipped; warning logged |
| DB connection error during journal | Error caught; sale response unaffected |
| Server restart between sale commit and adapter call | Journal never created; sale remains without journal until reconciliation |
| Adapter called twice (retry) | Second call: `{ created: false }` — no duplicate |
| Concurrent duplicate (P2002 race) | JournalService catches P2002, returns winner — no error |
| Void success, reversal journal fails | Void committed correctly; missing reversal journal logged for reconciliation |

---

## 10. Tests

### New tests: 28 / `sales-accounting.adapter.spec.ts`

| ID | Description |
|----|-------------|
| T01 | Feature flag OFF → recordSaleJournal no-op |
| T01b | Feature flag OFF → reverseSaleJournal no-op |
| T01c | Feature flag OFF → recordRefundJournal no-op |
| T02 | CASH payment → DR 1100 / CR 4100 |
| T03 | CASH tendered 500, total 450 → journal amount 450 |
| T04 | TRANSFER payment → DR 1120 / CR 4100 |
| T05 | CARD payment → DR 1120 / CR 4100 |
| T06 | Split CASH 200 + TRANSFER 250, total 450 → 2 journals |
| T07 | COGS: costPrice=100 qty=2 → DR 5100=200 / CR 1300=200 |
| T08 | costPrice=0 → COGS skipped, warning logged |
| T09 | Multiple items: COGS only for costPrice > 0 |
| T10 | sourceType=SALE_PAYMENT, sourceId=SalePayment.id |
| T11 | sourceType=SALE_COGS, sourceId=SaleItem.id |
| T12 | branchId=null → journal created with branchId=null |
| T13 | Duplicate call → {created:false}, no error |
| T14 | JournalService throws → caught by public method |
| T15 | Accounting failure never throws to POS caller |
| T16 | reverseSaleJournal finds and reverses SALE_PAYMENT journal |
| T17 | reverseSaleJournal: no existing journal → warns, no error |
| T18 | reverseSaleJournal reverses COGS journal too |
| T19 | reverseSaleJournal: feature flag OFF → no-op |
| T20 | recordRefundJournal CASH → DR 4100 / CR 1100 |
| T21 | recordRefundJournal creates COGS restore journal |
| T22 | recordRefundJournal skips COGS restore when costPrice=0 |
| T23 | recordRefundJournal: feature flag OFF → no-op |
| T24 | recordRefundJournal failure caught, not rethrown |
| T25 | tenantId passed through to every JournalService call |
| T26 | TRANSFER refund → CR 1120 Clearing |

### Full test suite regression

| Metric | Before | After |
|--------|--------|-------|
| Total tests | 280 | **308** |
| Passing | 280 | **308** |
| Failing | 0 | **0** |
| New tests added | — | +28 |

---

## 11. Rollback Procedure

If the integration needs to be disabled:

**Immediate (no code deploy needed):**
```bash
# Remove or set to false in production environment
ACCOUNTING_CORE_ENABLED=false
```

POS immediately reverts to pre-Phase-4B.1 behavior. No journals are created going forward.

**Full code rollback (if needed):**
1. Revert `backend/src/sales/sales.service.ts` — remove the 3 adapter calls and the constructor parameter
2. Revert `backend/src/sales/sales.module.ts` — remove `JournalModule` and `SalesAccountingAdapter`
3. Delete `backend/src/sales/sales-accounting.adapter.ts`
4. Delete `backend/src/sales/sales-accounting.adapter.spec.ts`
5. Revert `backend/src/sales/sales.workflow.spec.ts`

Existing `JournalEntry` rows (if any were created while enabled) are safe — they do not affect POS or CashDrawerTransaction in any way. The `JournalEntry` table is accounting-only and read-only from the POS perspective.

---

## 12. Production Deployment Procedure

**Prerequisites (must be done first):**
1. Verify `AccountingAccountsService.initializeForTenant()` has been run for all active tenants (Phase 3)
2. Verify all account codes used by the adapter exist: 1100, 1120, 1300, 4100, 5100
3. Deploy Phase 4B.1 application code (this build)
4. Verify all 308 tests pass in CI
5. Take production DB backup before enabling

**Activation steps:**
1. Set `ACCOUNTING_CORE_ENABLED=true` in Coolify environment variables
2. Trigger redeployment (or restart backend container)
3. Create one test sale in the POS
4. Verify `JournalEntry` and `JournalLine` rows were created with correct amounts
5. Verify `JournalEntry_sourceType_sourceId_tenantId_unique` index shows in EXPLAIN
6. Monitor error logs for the first 30 minutes

**Rollback trigger:** Any error containing `recordSaleJournal failed` or `recordRefundJournal failed` appearing repeatedly → set `ACCOUNTING_CORE_ENABLED=false`.

---

## 13. Statement: No Production Accounting Activation Performed

> **No production accounting activation was performed.**
>
> `ACCOUNTING_CORE_ENABLED` remains `false` in production.
> Zero `JournalEntry` rows were created.
> Zero `JournalLine` rows were created.
> No existing POS, Sale, SaleItem, SalePayment, StockMovement, or CashDrawerTransaction records were modified.
> No historical sales (89 existing Sale rows) were backfilled.
> Production deployment has not been performed.

---

## STOPPED

Awaiting owner approval before:
- Setting `ACCOUNTING_CORE_ENABLED=true` in production
- Deploying Phase 4B.1 to production
- Proceeding to Phase 4B.2 (reconciliation outbox, Repair/Expense wiring)
- Initializing AccountingAccounts for production tenants
- Backfilling any historical sales
