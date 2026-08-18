# Phase 4B.1 — Post-Implementation Review

**Review type:** Read-only verification  
**Date:** 2026-08-18  
**Reviewer:** Claude (automated, no code changes)  
**Source of truth:** Approved design in `PHASE_4B1A_POS_INTEGRATION_AUDIT.md`

---

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | sourceType / sourceId | **PASS** |
| 2 | Cash/change calculation | **PASS** |
| 3 | Split payment revenue | **PASS** |
| 4 | COGS | **PASS** |
| 5 | Tenant resolution | **PASS with note** |
| 6 | Feature flag | **PASS** |
| 7 | Failure handling | **PASS** |
| 8 | Void / refund correctness | **PASS with note** |
| 9 | Historical sales | **PASS** |
| 10 | Idempotency | **PASS** |
| 11 | Production impact | **PASS** |
| 12 | Tests | **PASS** |

**Overall:** ✅ PASS — implementation matches approved design. Two notes (not defects) are documented below.

---

## 1. sourceType / sourceId

**Verdict: PASS**

Verified in `sales-accounting.adapter.ts`:

| Journal purpose | `sourceType` | `sourceId` |
|----------------|--------------|------------|
| Revenue per payment leg | `'SALE_PAYMENT'` | `SalePayment.id` (leg.id) |
| COGS per sale item | `'SALE_COGS'` | `SaleItem.id` (item.id) |
| Refund revenue reversal | `'SALE_REFUND'` | `SaleRefund.id` (refund.id) |
| Refund COGS restore | `'SALE_REFUND_COGS'` | `${SaleRefund.id}:${SaleItem.id}` |
| Void reversal | `'JOURNAL_REVERSAL'` | original `JournalEntry.id` (via `JournalService.reverse()`) |

`sourceId` is **SalePayment.id** (not `Sale.id`) for revenue journals — matches the approved design. Idempotency is per-payment-leg, not per-sale. This is correct: a split payment produces two independent idempotent journals.

The composite `${refundId}:${saleItemId}` key for `SALE_REFUND_COGS` uses CUIDs which never contain `:`, making the composite unambiguous and safe. ✓

---

## 2. Cash / Change Calculation

**Verdict: PASS**

Verified code path in `_recordSaleJournal()` (lines 141–176):

```typescript
const nonCashTotal  = nonCashLegs.reduce((sum, p) => sum.plus(...p.amount), Decimal(0));
const cashNetAmount = Prisma.Decimal.max(Decimal(0), saleTotal.minus(nonCashTotal));
```

For a sale where `Sale.total = 450` but `SalePayment.amount = 500` (customer tendered 500, change = 50):
- `nonCashTotal = 0` (no non-cash legs)
- `cashNetAmount = max(0, 450 − 0) = 450`
- Journal debit: `450` ✓

`SalePayment.amount` (500, tendered) is **never posted as revenue.** Revenue posted is always `Sale.total` (net). ✓

`CashDrawerTransaction.amount` and `SalePayment.amount` are never modified. ✓

Decimal arithmetic uses `Prisma.Decimal` throughout — no floating-point errors. ✓

---

## 3. Split Payment Revenue

**Verdict: PASS**

For `CASH 200 + TRANSFER 250, Sale.total = 450`:
- `nonCashTotal = 250`
- `cashNetAmount = max(0, 450 − 250) = 200`
- CASH leg journal: DR 1100 = 200
- TRANSFER leg journal: DR 1120 = 250
- Total revenue posted: 200 + 250 = **450** = `Sale.total` ✓

Revenue is NOT duplicated. Each leg contributes exactly its share of the total revenue. `Sale.amountPaid` (which could exceed `Sale.total` due to change) is not used. ✓

Test T06 explicitly verifies this scenario. ✓

---

## 4. COGS

**Verdict: PASS**

**Cost snapshot:** `SaleItem.costPrice` (captured at sale time from `Product.costPrice`) is used. Current `Product.costPrice` is never queried by the adapter. The snapshot is correct for historical accuracy. ✓

**costPrice = 0:** Explicitly skipped with a `logger.warn()`. No zero-amount journal lines are created. Test T08 verifies. ✓

**Account mapping:** `DR 5100 (COGS)` / `CR 1300 (Inventory)` — matches `ACCOUNT_CODES.COGS` and `ACCOUNT_CODES.INVENTORY`. ✓

**Amount:** `costPrice × quantity` with `.toDecimalPlaces(2)` — correct Decimal rounding. ✓

**COGS reversal on void:** `reverseSaleJournal()` finds each `SALE_COGS` journal by `(sourceType='SALE_COGS', sourceId=item.id, tenantId)` and calls `JournalService.reverse()`. ✓

**COGS restore on refund:** `_recordRefundJournal()` creates `DR 1300 / CR 5100` per refunded item. Quantity used is `ri.quantity` (only the returned quantity, not full item quantity). ✓

---

## 5. Tenant Resolution

**Verdict: PASS with note**

The `tenantId` received by the adapter comes from `SalesService.create(dto, userId, branchId, tenantId)` — propagated from the JWT via the controller guard chain. This is the same `tenantId` already used by the existing `AccountingService.record()` call inside the POS transaction.

All three adapter call sites pass `tenantId ?? ''`:

```typescript
// SalesService.create():
await this.salesAccounting?.recordSaleJournal(sale as any, tenantId ?? '', userId);

// SalesService.voidSale():
await this.salesAccounting?.reverseSaleJournal(sale as any, tenantId ?? '', userId);

// SalesService.refundSaleItems():
await this.salesAccounting?.recordRefundJournal(..., tenantId ?? '', userId);
```

`JournalService.resolveAccounts()` validates that every `AccountingAccount` belongs to the provided `tenantId` — cross-tenant journal creation is structurally impossible. ✓

**Note (not a defect):** If `tenantId` is null (possible for SUPER_ADMIN sessions without a tenant context), the adapter receives `''` (empty string). `JournalService.validateTenant('')` will throw `NotFoundException('Tenant  not found')` — the adapter catches this, logs it, and returns. No journal is created. This is the intended "safely fail" behavior from the approved design. The logged error message is slightly confusing (`Tenant  not found` with blank ID) but is not a blocking issue.

For all normal operating scenarios (OWNER, STAFF, SUPER_ADMIN within a specific tenant's POS), `tenantId` from JWT is non-null and correct. ✓

---

## 6. Feature Flag

**Verdict: PASS**

**Implementation:** `private get isEnabled(): boolean { return process.env.ACCOUNTING_CORE_ENABLED === 'true'; }` — checked at every call site, not cached at startup. This allows toggling without restart. ✓

**Default behavior:** Any value other than the string `'true'` (including absent, `'false'`, `'1'`) returns `false`. The default is OFF. ✓

**Env file check:** `ACCOUNTING_CORE_ENABLED` was searched in all `.env*` files in `backend/`:
- `.env`
- `.env.development`
- `.env.production`
- `.env.production.example`
- `.env.example`

**Result: not found in any file.** The flag is absent everywhere. Default behavior (accounting disabled) is confirmed. ✓

When flag is OFF:
- `recordSaleJournal()` returns immediately at line 78 — zero DB queries, zero journal writes
- `reverseSaleJournal()` returns immediately at line 98
- `recordRefundJournal()` returns immediately at line 120
- POS behavior is byte-for-byte identical to pre-Phase-4B.1 ✓

---

## 7. Failure Handling

**Verdict: PASS**

Each public method wraps its internal implementation in a `try/catch`:

```typescript
async recordSaleJournal(sale, tenantId, actorId): Promise<void> {
  if (!this.isEnabled) return;
  try {
    await this._recordSaleJournal(sale, tenantId, actorId);
  } catch (err) {
    this.logger.error(`recordSaleJournal failed: saleId=${sale.id} ...`, err);
    // no re-throw
  }
}
```

The method signature returns `Promise<void>`. Any error thrown from `_recordSaleJournal()` (NotFoundException from missing account, P2002, network error, etc.) is caught and logged. Nothing is re-thrown. ✓

The `SalesService.create()` call site:
```typescript
await this.salesAccounting?.recordSaleJournal(sale as any, tenantId ?? '', userId);
```
Even if `salesAccounting` is undefined (e.g. in unit tests that don't provide the adapter), `?.` short-circuits to `undefined`, which `await` resolves immediately. ✓

**The already-committed POS sale is never affected by accounting failure.** ✓

Tests T14 and T15 explicitly verify that `JournalService` throwing causes no propagation. ✓

---

## 8. Void / Refund Correctness

**Verdict: PASS with note**

**Void (`reverseSaleJournal`):**
- Looks up `SALE_PAYMENT` journals by `(SalePayment.id, tenantId)` and reverses each
- Also looks up `SALE_COGS` journals by `(SaleItem.id, tenantId)` and reverses each
- Skips if journal not found (warns) or already voided (warns) — no error thrown
- The `sale` object from `findOne()` carries both `payments[]` and `items[]`. ✓
- `JournalService.reverse()` creates a new entry linked via `sourceType='JOURNAL_REVERSAL'` — no double-posting. ✓

**Refund (`recordRefundJournal`):**
- Revenue reversal: DR 4100 / CR 1100 (or CR 1120 for non-cash). Amount = `SaleRefund.totalRefund` (actual refund amount, not Sale.total). ✓
- COGS restore: DR 1300 / CR 5100. Amount = `SaleItem.costPrice × refundedQty`. Only items in `refundItems[]` are processed — a partial refund correctly restores only the returned items. ✓
- Revenue is not double-reversed: `SaleRefund.id` as `sourceId` is unique per refund event. ✓

**Note (known gap, not a defect):** `exchangeSaleItems()` is **not wired** to the adapter. If ACCOUNTING_CORE_ENABLED is enabled and a sale exchange occurs, no journal entries are created for the exchange. This was acknowledged in the Phase 4B.1A audit and is out of scope for Phase 4B.1. The exchange flow is a combined refund + new sale, requiring more careful mapping. When ACCOUNTING_CORE_ENABLED is first enabled in production, exchange operations should be monitored and Phase 4B.2 should include exchange wiring.

---

## 9. Historical Sales

**Verdict: PASS**

The adapter is only called from:
1. `SalesService.create()` — only fires for NEW sales (after the POS transaction commits)
2. `SalesService.voidSale()` — only fires for NEW voids
3. `SalesService.refundSaleItems()` — only fires for NEW refunds

There is no loop over existing `Sale` records, no `prisma.sale.findMany()` in the adapter, no migration, no background job. The adapter is purely reactive — it only runs when a POS operation happens after the feature is enabled. ✓

The 89 existing `Sale` rows in production will NOT receive journals. This is correct per the approved design: **forward-only**. ✓

---

## 10. Idempotency

**Verdict: PASS**

All `sourceType` / `sourceId` combinations are compatible with the Phase 4A.1 partial unique index:

```sql
CREATE UNIQUE INDEX "JournalEntry_sourceType_sourceId_tenantId_unique"
  ON "JournalEntry" ("sourceType", "sourceId", "tenantId")
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL;
```

| sourceType | sourceId | NULL? | Index applies? |
|-----------|---------|-------|---------------|
| `SALE_PAYMENT` | `SalePayment.id` | never null | ✓ |
| `SALE_COGS` | `SaleItem.id` | never null | ✓ |
| `SALE_REFUND` | `SaleRefund.id` | never null | ✓ |
| `SALE_REFUND_COGS` | `${refundId}:${saleItemId}` | never null | ✓ |
| `JOURNAL_REVERSAL` | original `JournalEntry.id` | never null | ✓ |

Application-level: `JournalService.findBySource()` runs before `create()` — existing entry returns `{ created: false }`.

DB-level: Concurrent duplicate → P2002 → `JournalService` catches P2002, re-fetches winner, returns `{ created: false }`. ✓

Tests T13, T14 verify idempotency behavior at the adapter level. The adapter does not need to handle P2002 itself — `JournalService` already does. ✓

---

## 11. Production Impact

**Verdict: PASS**

**Deployment status:** Phase 4B.1 application code was **NOT deployed** to production. All changes are local to the development machine. The production containers are still running the pre-Phase-4B.1 build.

**Feature flag in production:** `ACCOUNTING_CORE_ENABLED` is absent from all `.env*` files. Not set.

**Production DB state** (from Phase 4A.1 verification on 2026-08-17, confirmed unchanged):

| Table | Count |
|-------|-------|
| JournalEntry | **0** |
| JournalLine | **0** |
| AccountingAccount | **0** |
| Sale | 89 (unchanged) |
| SaleItem | (unchanged) |
| SalePayment | (unchanged) |

No `JournalEntry` or `JournalLine` rows were created. No business data was modified. ✓

**Note:** Docker is not available in the current terminal session (Windows development machine, not the server). The production DB count above is derived from the last SSH verification performed during Phase 4A.1 (2026-08-17 ~11:00 UTC). Since Phase 4B.1 was never deployed, the production DB state cannot have changed due to this phase's work.

---

## 12. Tests

**Verdict: PASS**

```
Test Suites: 27 passed, 27 total
Tests:       308 passed, 308 total
Snapshots:   0 total
Time:        ~37s
```

| Suite | Before | After |
|-------|--------|-------|
| Pre-existing | 280 | 280 ✓ (no regression) |
| New adapter tests | — | 28 |
| **Total** | **280** | **308** |

All 28 adapter tests cover the exact scenarios required by the spec:
- Feature flag ON/OFF (3 tests)
- CASH/TRANSFER/CARD payment types (3 tests)
- Cash/change net calculation (1 test)
- Split payment (1 test)
- COGS calculation, zero-cost skip, multiple items (3 tests)
- sourceType/sourceId correctness (2 tests)
- branchId=null handling (1 test)
- Idempotency + error handling (4 tests)
- Void reversal (3 tests)
- Refund journal + COGS restore + failure (5 tests)
- Tenant isolation (1 test)
- TRANSFER refund (1 test)

---

## Notes Summary (not defects)

| # | Note | Severity |
|---|------|----------|
| N1 | SUPER_ADMIN with null tenantId: adapter gets `tenantId=''`, JournalService throws NotFoundException, adapter logs and swallows. No journal created. Intentional "safely fail" behavior. Log message shows blank tenant ID. | Low |
| N2 | `exchangeSaleItems()` not wired to adapter. Exchange operations will not generate journals when accounting is enabled. Acknowledged gap; belongs to Phase 4B.2. | Known gap |

---

## Conclusion

Phase 4B.1 implementation is **correctly implemented** and matches the approved design from `PHASE_4B1A_POS_INTEGRATION_AUDIT.md`.

- POS transaction is unchanged
- Adapter is fully isolated post-commit
- Feature flag defaults OFF
- No production data was touched
- 308/308 tests pass

---

## STOPPED

Not proceeding to Phase 4B.2.

Awaiting owner approval to:
- Deploy Phase 4B.1 to production
- Enable `ACCOUNTING_CORE_ENABLED=true`
- Proceed to Phase 4B.2 (exchange wiring, Repair/Expense integration, reconciliation outbox)
