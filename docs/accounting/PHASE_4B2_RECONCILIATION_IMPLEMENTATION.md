# Phase 4B.2 — Accounting Reconciliation & Recovery Implementation

**Status:** COMPLETE — NOT YET ENABLED IN PRODUCTION  
**Date:** 2026-08-18  
**Feature flags:** `ACCOUNTING_CORE_ENABLED` + `ACCOUNTING_ENABLED_TENANTS` — both unset in production  
**No production JournalEntry rows created**

---

## Summary

Phase 4B.2 adds three capabilities on top of the Phase 4B.1 post-commit adapter:

1. **Tenant allowlist** — `ACCOUNTING_ENABLED_TENANTS` env var for pilot gating (allowlist added to `SalesAccountingAdapter.isEnabledForTenant()`)
2. **Scheduled reconciliation** — `AccountingReconciliationService` scans every 15 minutes for sales with missing journals and auto-recovers them
3. **Admin endpoints** — `POST /admin/accounting/run-reconciliation` and `POST /admin/accounting/retry-sale/:saleId` for manual intervention

---

## 1. Files Changed

| File | Change |
|------|--------|
| `backend/src/sales/sales-accounting.adapter.ts` | `isEnabled` getter replaced with `isEnabledForTenant(tenantId)` + allowlist logic |
| `backend/src/sales/sales-accounting.adapter.spec.ts` | Added T-A through T-H (8 allowlist tests); env cleanup updated |
| `backend/src/sales/sales.module.ts` | Added `SalesAccountingAdapter` to `exports` |
| `backend/src/accounting-reconciliation/accounting-reconciliation.service.ts` | **NEW** — core reconciliation service |
| `backend/src/accounting-reconciliation/accounting-reconciliation.controller.ts` | **NEW** — admin endpoints |
| `backend/src/accounting-reconciliation/accounting-reconciliation.module.ts` | **NEW** — NestJS module |
| `backend/src/accounting-reconciliation/accounting-reconciliation.service.spec.ts` | **NEW** — 25 reconciliation tests |
| `backend/src/app.module.ts` | Registered `AccountingReconciliationModule` |
| `docs/accounting/PHASE_4B2_RECONCILIATION_IMPLEMENTATION.md` | **NEW** — this document |

---

## 2. Tenant Allowlist (`ACCOUNTING_ENABLED_TENANTS`)

### Logic

```
ACCOUNTING_CORE_ENABLED != 'true'                   → disabled (everyone)
ACCOUNTING_CORE_ENABLED = 'true' + no allowlist     → enabled (all tenants, full-rollout mode)
ACCOUNTING_CORE_ENABLED = 'true' + allowlist set    → only listed tenants enabled (pilot mode)
```

### Implementation

```typescript
// sales-accounting.adapter.ts
isEnabledForTenant(tenantId: string): boolean {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false;
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
  if (!raw) return true;  // no allowlist = all tenants (full-rollout)
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  return allowed.includes(tenantId);
}
```

All three public methods (`recordSaleJournal`, `reverseSaleJournal`, `recordRefundJournal`) now call `isEnabledForTenant(tenantId)` instead of the old `isEnabled` getter. This is a **non-breaking change** — existing POS behavior is unchanged when `ACCOUNTING_ENABLED_TENANTS` is absent.

### Env var format

```bash
# Pilot: enable only for specific tenants
ACCOUNTING_ENABLED_TENANTS=clxxxxxtenantid1,clxxxxxtenantid2

# Full rollout: omit entirely (or set to empty string)
# ACCOUNTING_ENABLED_TENANTS=
```

---

## 3. Scheduled Reconciliation Scan

### Cron schedule

`0 */15 * * * *` — fires at :00, :15, :30, :45 of every hour (every 15 minutes).

### What it scans

For each enabled tenant:
1. Queries branches belonging to that tenant
2. Loads up to **100 sales** created after `ACCOUNTING_ACTIVATION_TIMESTAMP` (oldest-first)
3. Batch-fetches all relevant `JournalEntry` records (2 queries per tenant: one for sale journals, one for reversals)
4. Classifies each sale (see §4 below)
5. Auto-recovers non-ERROR statuses via `SalesAccountingAdapter` (idempotent)
6. Logs a summary: `scanned / posted / recovered / errors`

### Required env vars (both must be set before activation)

| Var | Purpose | Example |
|-----|---------|---------|
| `ACCOUNTING_CORE_ENABLED` | Global accounting on/off | `true` |
| `ACCOUNTING_ACTIVATION_TIMESTAMP` | Oldest sale date to scan | `2026-09-01T00:00:00+07:00` |
| `ACCOUNTING_ENABLED_TENANTS` | Pilot tenant IDs (empty = all) | `clxxxx` |

If `ACCOUNTING_ACTIVATION_TIMESTAMP` is not set, the scheduled scan logs an ERROR and returns early — this prevents accidentally journaling all historical sales.

### Batch size

**100 sales per tenant per run.** If more than 100 sales are missing journals, subsequent cron runs will catch the rest (scan is idempotent). For a typical shop with <10 sales per 15-minute window, this is never reached.

---

## 4. Sale Classification

| Status | Condition | Auto-recovery |
|--------|-----------|---------------|
| `POSTED` | All expected journals present with correct amounts | None (already done) |
| `MISSING_REVENUE` | ≥1 `SALE_PAYMENT` journal missing | `recordSaleJournal()` |
| `MISSING_COGS` | Revenue journals OK, ≥1 `SALE_COGS` missing | `recordSaleJournal()` |
| `PARTIAL` | Mix of revenue + COGS + refund journals missing | `recordSaleJournal()` |
| `VOID_MISSING` | Voided sale has `SALE_PAYMENT` journal but no `JOURNAL_REVERSAL` | `reverseSaleJournal()` |
| `REFUND_MISSING` | `SALE_REFUND` or `SALE_REFUND_COGS` journal missing | `recordRefundJournal()` |
| `ERROR` | Journal exists but debit amount doesn't match expected | **None** — manual review required |

**Notes:**
- `POSTED` for a voided sale with no `SALE_PAYMENT` journal means: accounting was not enabled when this sale was processed. No action needed.
- `ERROR` is reported but never auto-fixed. The mismatch must be investigated and corrected manually.
- Zero-cost items (`SaleItem.costPrice = 0`) have no expected `SALE_COGS` journal and are never flagged as missing.

---

## 5. Admin Endpoints

### `POST /admin/accounting/run-reconciliation`

Manually triggers the reconciliation scan.

| Field | Details |
|-------|---------|
| Guard | JWT + TenantActive + Permission (`accounting.admin`) |
| Scope | OWNER → scoped to their tenant; SUPER_ADMIN → optional `?tenantId=xxx` |
| Returns | `ReconciliationReport` (see types below) |

```
POST /admin/accounting/run-reconciliation
POST /admin/accounting/run-reconciliation?tenantId=clxxxx  (SUPER_ADMIN only)
```

### `POST /admin/accounting/retry-sale/:saleId`

Retries accounting for a single sale.

| Field | Details |
|-------|---------|
| Guard | JWT + TenantActive + Permission (`accounting.admin`) |
| Scope | OWNER → blocked if sale belongs to a different tenant; SUPER_ADMIN → any tenant |
| Returns | `SaleReconciliationItem` |

```
POST /admin/accounting/retry-sale/clxxxxxsaleid
```

### Permission

`accounting.admin` is seeded at module startup via `onModuleInit` for `OWNER` role (same pattern as `expenses.manage`). No migration needed.

---

## 6. Response Types

```typescript
type SaleJournalStatus =
  | 'POSTED' | 'MISSING_REVENUE' | 'MISSING_COGS'
  | 'PARTIAL' | 'VOID_MISSING'   | 'REFUND_MISSING' | 'ERROR';

interface SaleReconciliationItem {
  saleId:         string;
  receiptNumber:  string;
  status:         SaleJournalStatus;
  missingRevenue: string[];   // SalePayment.ids
  missingCogs:    string[];   // SaleItem.ids
  voidMissing:    boolean;
  refundsMissing: string[];   // SaleRefund.id or 'COGS_REVERSAL:<refundId>:<saleItemId>'
  errors:         string[];   // human-readable mismatch descriptions
  recovered:      boolean;    // true if auto-recovery succeeded this run
}

interface ReconciliationReport {
  scannedAt:    string;   // ISO 8601
  tenantId:     string | null;
  activationTs: string;   // ISO 8601
  summary: {
    scanned:   number;
    posted:    number;
    missing:   number;
    recovered: number;
    errors:    number;
  };
  items: SaleReconciliationItem[];
}
```

---

## 7. Feature Flag Tests (T-A through T-H)

Added to `backend/src/sales/sales-accounting.adapter.spec.ts`:

| ID | Scenario | Expected |
|----|----------|----------|
| T-A | Global ON + no allowlist | All tenants enabled (full-rollout) |
| T-B | Global ON + tenant not in allowlist | No journal created |
| T-C | Global ON + tenant in allowlist | Journal created |
| T-D | Global ON + allowlist with multiple tenants, mine included | Journal created |
| T-E | Global ON + allowlist with surrounding whitespace | Whitespace trimmed, journal created |
| T-F | Global ON + allowlist set, my tenant not in it | No journal created |
| T-G | Global OFF + allowlist set | No-op regardless |
| T-H | Global ON + allowlist matches tenantId but different tenantId passed | Cross-tenant blocked |

---

## 8. Reconciliation Tests (R01–R25)

In `backend/src/accounting-reconciliation/accounting-reconciliation.service.spec.ts`:

| ID | Scenario |
|----|----------|
| R01 | Fully posted sale → POSTED, no recovery |
| R02 | No SALE_PAYMENT journal → MISSING_REVENUE + recovery called |
| R03 | Revenue present, COGS missing → MISSING_COGS + recovery |
| R04 | Some journals missing across both categories → PARTIAL |
| R05 | Zero-cost SaleItem → not flagged as missing COGS |
| R06 | Voided sale: SALE_PAYMENT exists, no JOURNAL_REVERSAL → VOID_MISSING + recovery |
| R07 | Voided sale: no SALE_PAYMENT journal → POSTED (nothing to do) |
| R08 | SALE_REFUND journal missing → REFUND_MISSING + recovery |
| R09 | COGS journal debit wrong → ERROR, no auto-recovery |
| R10 | MISSING_REVENUE → recordSaleJournal called, recovered=true |
| R11 | MISSING_COGS → recordSaleJournal called (idempotent) |
| R12 | VOID_MISSING recovery calls reverseSaleJournal with correct args |
| R13 | REFUND_MISSING recovery calls recordRefundJournal with correct args |
| R14 | createdAt < activationTs → not in scan (verified via DB query args) |
| R15 | ACCOUNTING_CORE_ENABLED=false → empty report, no DB queries |
| R16 | ACCOUNTING_ACTIVATION_TIMESTAMP not set → empty report + ERROR log |
| R17 | runReconciliation({tenantId}) → branch query scoped to that tenant |
| R18 | retrySale cross-tenant (OWNER) → ForbiddenException |
| R19 | retrySale own-tenant → classified + recovered |
| R20 | retrySale unknown saleId → NotFoundException |
| R21 | SUPER_ADMIN can retry a sale from any tenant |
| R22 | scheduledScan: accounting disabled → returns without DB queries |
| R23 | scheduledScan: accounting enabled → calls runReconciliation, logs result |
| R24 | No allowlist → scans all tenants via tenant.findMany |
| R25 | TRANSFER journal debit mismatch → ERROR |

---

## 9. Test Results

```
Test Suites: 28 passed, 28 total
Tests:       341 passed, 341 total
Snapshots:   0 total

Breakdown:
  Pre-existing (Phase 4B.1 and before) : 308
  New T-A through T-H (allowlist)      :   8
  New R01–R25 (reconciliation)         :  25
  Total                                : 341
```

---

## 10. Security

### Tenant isolation
- `runReconciliation` scoped to caller's `tenantId` from JWT (OWNER role)
- SUPER_ADMIN may pass `?tenantId=xxx` to target any tenant
- `retrySale` verifies `Sale.branch.tenantId === callerTenantId` before proceeding
- SUPER_ADMIN bypasses tenant check (same as all other SUPER_ADMIN flows)

### No cross-tenant journal creation
- All adapter calls pass the verified `tenantId`
- `JournalService.resolveAccounts()` validates accounts belong to `tenantId` — structural guarantee

### No production risk
- `AccountingReconciliationModule` registered in AppModule but **cron is a no-op** until `ACCOUNTING_CORE_ENABLED=true`
- Both admin endpoints require `accounting.admin` permission (OWNER only)
- No schema changes, no migrations

---

## 11. Activation Procedure (when approved)

**Prerequisites:**
1. Phase 4B.1 deployed to production
2. `AccountingAccounts` initialized for pilot tenant (Phase 3)
3. All 341 tests pass in CI
4. DB backup taken

**Activation steps:**
```bash
# In Coolify environment variables (backend container):
ACCOUNTING_CORE_ENABLED=true
ACCOUNTING_ACTIVATION_TIMESTAMP=2026-09-01T00:00:00+07:00  # set to pilot go-live date
ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>               # pilot tenant only
```

**Verification after activation:**
1. Trigger one test sale in POS
2. Check `JournalEntry` and `JournalLine` were created
3. Wait 15 minutes → first scheduled scan runs
4. Call `POST /admin/accounting/run-reconciliation` — confirm `summary.posted` increases
5. Monitor logs for `scheduledScan` entries

**Rollback:**
- Immediate: `ACCOUNTING_CORE_ENABLED=false` → all adapter calls no-op, cron skips
- Code: reverse `app.module.ts` import (remove `AccountingReconciliationModule`)

---

## 12. What Is NOT in Phase 4B.2

| Item | Phase |
|------|-------|
| Exchange flow journaling | 4B.4 (requires data gap fix in `exchangeSaleItems()`) |
| Repair journal entries | 4B.3 |
| Expense journal entries | 4B.3 |
| Account code seeding (6xxx expenses) | 4B.3 |
| Repair deposit accounting | 4B.3 |

---

## STOPPED

Not proceeding further.

Awaiting owner approval before:
- Setting `ACCOUNTING_CORE_ENABLED=true` in production
- Setting `ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>` in production
- Setting `ACCOUNTING_ACTIVATION_TIMESTAMP` in production
- Deploying Phase 4B.1 + 4B.2 build to production
- Proceeding to Phase 4B.3 (Repair/Expense journal entries)
- Proceeding to Phase 4B.4 (Exchange flow journaling)
