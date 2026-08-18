# Phase 4B.2.1 — Final Safety Review

**Review type:** Read-only code audit  
**Date:** 2026-08-18  
**Scope:** `SalesAccountingAdapter.isEnabledForTenant()` · `AccountingReconciliationService` · env var interaction · production safety for multi-tenant SaaS  
**Code changes:** NONE — report only

---

## Executive Summary

| # | Severity | Finding |
|---|----------|---------|
| SF-1 | 🔴 HIGH | Absent `ACCOUNTING_ENABLED_TENANTS` **enables ALL tenants** — fail-open default |
| SF-2 | 🔴 HIGH | Empty string / whitespace `ACCOUNTING_ENABLED_TENANTS` = same as absent = ALL tenants |
| SF-3 | 🔴 HIGH | Cron scan also fail-open: absent allowlist → scan queries every tenant in the DB |
| SF-4 | 🟡 MEDIUM | Past `ACCOUNTING_ACTIVATION_TIMESTAMP` enables journal creation for historical sales |
| SF-5 | 🟢 LOW | Invalid tenant ID in allowlist silently disables all tenants; no warning logged |

All three HIGH findings share one root cause: the current default is **fail-open**. This is unsafe for a multi-tenant SaaS pilot.

---

## 1. Exact Code Being Reviewed

### `SalesAccountingAdapter.isEnabledForTenant()` — [sales-accounting.adapter.ts:69](../../backend/src/sales/sales-accounting.adapter.ts#L69)

```typescript
isEnabledForTenant(tenantId: string): boolean {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false;          // line 70
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();         // line 71
  if (!raw) return true; // no allowlist = all tenants enabled                // line 72
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);       // line 73
  return allowed.includes(tenantId);                                          // line 74
}
```

### `AccountingReconciliationService.getEnabledTenantIds()` — [accounting-reconciliation.service.ts:206](../../backend/src/accounting-reconciliation/accounting-reconciliation.service.ts#L206)

```typescript
private getEnabledTenantIds(): string[] | null {
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
  if (!raw) return null;   // null = "no allowlist" → caller scans all tenants
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}
```

### `AccountingReconciliationService.runReconciliation()` — relevant excerpt

```typescript
const allowlist = this.getEnabledTenantIds();
if (allowlist !== null) {
  return this.scanTenants(allowlist, activationTs, null);
}
// Full-rollout mode (no allowlist): scan all tenants
const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
return this.scanTenants(tenants.map((t) => t.id), activationTs, null);
```

### `AccountingReconciliationService.scheduledScan()`

```typescript
@Cron('0 */15 * * * *')
async scheduledScan(): Promise<void> {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return;
  // ... calls runReconciliation() ...
}
```

### `AccountingReconciliationService.activationTimestamp` getter

```typescript
private get activationTimestamp(): Date | null {
  const ts = process.env.ACCOUNTING_ACTIVATION_TIMESTAMP;
  if (!ts) return null;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;
}
```

---

## 2. Scenario-by-Scenario Trace

### Scenario 1: `ACCOUNTING_CORE_ENABLED=false`, `ACCOUNTING_ENABLED_TENANTS` absent

**`isEnabledForTenant(anyTenant)`:**
```
line 70: process.env.ACCOUNTING_CORE_ENABLED !== 'true'
         ↳ 'false' !== 'true' → true
         → return false ← exits here, line 71–74 never reached
```

**POS `recordSaleJournal(sale, tenantId)`:**
```
if (!this.isEnabledForTenant(tenantId)) return;
    !false = true → return immediately
```

**`scheduledScan()`:**
```
if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return;
    'false' !== 'true' → return immediately
```

**Verdict: SAFE ✓**  
Zero DB queries. Zero journal writes. POS behavior identical to pre-Phase-4B.1.

---

### Scenario 2: `ACCOUNTING_CORE_ENABLED=true`, `ACCOUNTING_ENABLED_TENANTS` absent

**`isEnabledForTenant('tenant-A')`:**
```
line 70: 'true' !== 'true' → false → do NOT return, continue to line 71
line 71: raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim()
              = (undefined ?? '').trim()
              = ''.trim()
              = ''
line 72: if (!raw) → if (!'') → if (true) → return true   ← ALL tenants pass
```

**`isEnabledForTenant('tenant-B')`, `isEnabledForTenant('tenant-Z')`:**  
Identical trace. Line 72 fires for every tenant. All return `true`.

**`runReconciliation()` (from scheduled scan, if `ACCOUNTING_ACTIVATION_TIMESTAMP` is set):**
```
ACCOUNTING_CORE_ENABLED = 'true' → passes first check
activationTs = valid Date         → passes second check
options.tenantId = undefined      → skips per-tenant branch

allowlist = getEnabledTenantIds()
    raw = '' → return null

allowlist === null → falls to:

const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
return this.scanTenants(tenants.map(t => t.id), activationTs, null);
    ↑ queries EVERY tenant row in the database
```

---

## 🔴 SF-1 — Absent allowlist = ALL tenants enabled (HIGH)

**Affected code:** `isEnabledForTenant()` line 72 and `getEnabledTenantIds()` return null branch.

**What happens:** When `ACCOUNTING_ENABLED_TENANTS` is absent and `ACCOUNTING_CORE_ENABLED=true`, every call to `isEnabledForTenant()` returns `true`, and the reconciliation scan queries and processes every tenant in the DB.

**Real-world failure mode for pilot activation:**

An operator prepares to activate accounting for the pilot tenant. They set:
```
ACCOUNTING_CORE_ENABLED=true
```
They have not yet set `ACCOUNTING_ENABLED_TENANTS` (perhaps it was step 2 in the checklist and they deployed after step 1). The result: **accounting activates for every paying customer simultaneously** — their sales are journaled, their journals appear in the ledger, and the next cron scan touches all tenant data.

This is not a theoretical risk. It is the most likely human error in a multi-step production deployment.

**Current code comment (line 65–66):**
```
// ACCOUNTING_ENABLED_TENANTS absent / empty string → all tenants are enabled
// (full-rollout mode, no allowlist filtering).
```
The comment describes this as intended "full-rollout mode." But for a pilot on a live SaaS, full rollout is not a safe default — it should require explicit opt-in.

---

## 🔴 SF-2 — Empty string and whitespace = ALL tenants enabled (HIGH)

**Affected code:** `isEnabledForTenant()` line 71–72.

**What happens:**

| Value of `ACCOUNTING_ENABLED_TENANTS` | `raw` after trim | `!raw` | Result |
|---------------------------------------|-----------------|--------|--------|
| Not set (absent) | `''` | `true` | ALL tenants enabled |
| `""` (empty string) | `''` | `true` | ALL tenants enabled |
| `" "` (single space) | `''` | `true` | ALL tenants enabled |
| `"   "` (spaces) | `''` | `true` | ALL tenants enabled |
| `"\t"` (tab) | `''` | `true` | ALL tenants enabled |

**Real-world failure mode:**

In Coolify (the production deployment platform), environment variable fields accept empty strings. An operator reviewing the config might clear the `ACCOUNTING_ENABLED_TENANTS` field in the UI — intending to "reset" or "leave it blank" — and save. If `ACCOUNTING_CORE_ENABLED=true` is already set, this silently enables all tenants.

This is dangerous because the UI action ("clear the field") looks like disabling the allowlist, but the code interprets it as "no allowlist = all tenants."

---

## 🔴 SF-3 — Cron scan is also fail-open (HIGH)

**Affected code:** `runReconciliation()` lines 108–115.

**What happens:** `getEnabledTenantIds()` returns `null` when `ACCOUNTING_ENABLED_TENANTS` is absent/empty. `runReconciliation()` interprets `null` as "full-rollout mode" and calls `prisma.tenant.findMany()` to get every tenant, then scans all of them.

This means the scheduled scan has the same fail-open behavior as the adapter. Setting `ACCOUNTING_CORE_ENABLED=true` without an allowlist causes the cron to scan all tenant data every 15 minutes.

**Precise trace:**
```
ACCOUNTING_CORE_ENABLED = 'true'    → passes guard
ACCOUNTING_ACTIVATION_TIMESTAMP set → passes guard
ACCOUNTING_ENABLED_TENANTS absent   → getEnabledTenantIds() returns null
allowlist === null                  → queries ALL tenants from DB
scanTenants([t1, t2, t3, ...])      → scans every tenant's sales
```

---

### Scenario 3: `ACCOUNTING_CORE_ENABLED=true`, `ACCOUNTING_ENABLED_TENANTS="tenant-A"`

**`isEnabledForTenant('tenant-A')`:**
```
line 70: 'true' !== 'true' → false → continue
line 71: raw = 'tenant-A'.trim() = 'tenant-A'
line 72: !'tenant-A' → false → continue
line 73: allowed = ['tenant-A']
line 74: allowed.includes('tenant-A') → true → return true ✓
```

**`isEnabledForTenant('tenant-B')`:**
```
line 74: allowed.includes('tenant-B') → false → return false ✓
```

**`getEnabledTenantIds()`:**
```
raw = 'tenant-A'
return ['tenant-A']  ← not null
```

**`runReconciliation()`:**
```
allowlist = ['tenant-A']
allowlist !== null → scanTenants(['tenant-A'], ...) ← only tenant-A scanned ✓
```

**Verdict: SAFE for pilot mode ✓**  
Only `tenant-A` is enabled. All other tenants receive `false` from `isEnabledForTenant()`. Scan only touches tenant-A's branches and sales.

---

### Scenario 4: Edge cases in `ACCOUNTING_ENABLED_TENANTS`

**`ACCOUNTING_ENABLED_TENANTS=""` (empty string)**  
→ same as absent: ALL tenants enabled. See SF-2.

**`ACCOUNTING_ENABLED_TENANTS=" "` (whitespace only)**  
→ `.trim()` = `''` → same as empty. ALL tenants enabled. See SF-2.

**`ACCOUNTING_ENABLED_TENANTS="tenant-A,tenant-A"` (duplicates)**
```
allowed = ['tenant-A', 'tenant-A']
allowed.includes('tenant-A') → true  (Array.includes finds first match, harmless)
```
✓ Harmless. Works correctly. No deduplication needed for `Array.includes`.

**`ACCOUNTING_ENABLED_TENANTS="cld99999999fake"` (invalid / nonexistent tenant ID)**
```
allowed = ['cld99999999fake']
allowed.includes('real-tenant-id') → false → return false
```

---

## 🟢 SF-5 — Invalid tenant ID silently disables all tenants (LOW)

**What happens:** If the allowlist contains a typo or a tenant ID that doesn't exist, `isEnabledForTenant()` returns `false` for all real tenants and `getEnabledTenantIds()` returns an array with the bad ID, causing the scan to target a nonexistent tenant (which finds 0 branches and does nothing).

**Real-world failure mode:** Operator types `ACCOUNTING_ENABLED_TENANTS=tenant-ABC` but the real ID is `clxxxxxtenantABC`. Accounting appears to be configured, but nothing is journaled. No error or warning is logged. Difficult to diagnose.

**This is safe from a data-corruption standpoint** (no journals are wrongly created), but confusing operationally. A warning log like "ACCOUNTING_ENABLED_TENANTS contains 'tenant-ABC' but no branches found" would help. No code change recommended now — log it during manual testing.

---

### Scenario 5: Confirmed — absent allowlist = full rollout

**CONFIRMED.** The exact line:
```typescript
if (!raw) return true; // no allowlist = all tenants enabled
```
This is intentional behavior documented in the code comment. It is also verified by test T-A.

**However, for a multi-tenant SaaS in pilot mode, this is the wrong safe default.**  
See SF-1 for the recommended change.

---

## 3. Verdict on Multi-Tenant SaaS Safety

**Current default is UNSAFE for pilot activation on a production SaaS.**

The fail-open model was designed for convenience (no allowlist = all ready to go), but it creates a dangerous deployment window. In a typical pilot:

1. Operator sets `ACCOUNTING_CORE_ENABLED=true` — **accounting immediately enables for ALL tenants**
2. Operator then sets `ACCOUNTING_ENABLED_TENANTS=pilot-tenant-id` — now only pilot tenant

Between steps 1 and 2, accounting is live for all customers. On a system with 15-minute crons, the first cron run might fire in this window and scan all tenant data.

**The safe pattern is:**
- `ACCOUNTING_CORE_ENABLED=true` alone → nobody enabled (fail-closed)
- Must also explicitly set `ACCOUNTING_ENABLED_TENANTS=<tenant-id>`

This requires a **one-line code change** to `isEnabledForTenant()` and a matching change to `getEnabledTenantIds()`. No schema migration needed. Not making the change now per review-only instruction.

---

## 4. `ACCOUNTING_ACTIVATION_TIMESTAMP` — Historical Backfill Safety

### When absent (current production state)

```typescript
private get activationTimestamp(): Date | null {
  const ts = process.env.ACCOUNTING_ACTIVATION_TIMESTAMP;
  if (!ts) return null;                    // ← absent → null
  const d = new Date(ts);
  return isNaN(d.getTime()) ? null : d;   // ← invalid string → null
}
```

```typescript
const activationTs = this.activationTimestamp;
if (!activationTs) {
  this.logger.error('... ACCOUNTING_ACTIVATION_TIMESTAMP not set — scan skipped ...');
  return this.emptyReport(...);            // ← returns empty, zero queries
}
```

**CONFIRMED: No scan runs when `ACCOUNTING_ACTIVATION_TIMESTAMP` is absent.** Zero DB queries. Zero journal writes. ✓

### When set to a PAST date (e.g., `2020-01-01`)

```typescript
const sales = await this.prisma.sale.findMany({
  where: {
    branchId:  { in: branchIds },
    createdAt: { gte: activationTs },   // ← 2020-01-01T00:00:00Z
  },
  take: 100,
  orderBy: { createdAt: 'asc' },
});
```

The query returns the 100 oldest sales since 2020-01-01. For each sale that has no `SALE_PAYMENT` journal (i.e., all historical sales, since accounting was not enabled in 2020), `classifySale()` returns `MISSING_REVENUE`. The recovery path calls:

```typescript
await this.salesAccounting.recordSaleJournal(sale, tenantId, null);
```

`recordSaleJournal()` calls `isEnabledForTenant(tenantId)`. If accounting is enabled → **journal entries are created for 2020 historical sales.**

---

## 🟡 SF-4 — Past activation timestamp enables historical backfill (MEDIUM)

**What happens:** If `ACCOUNTING_ACTIVATION_TIMESTAMP=2020-01-01T00:00:00Z` is set, the reconciliation scan will create `JournalEntry` and `JournalLine` records for sales dating back to 2020. This directly violates the specification requirement: "Do NOT backfill historical sales."

**The timestamp is the ONLY guard.** There is no other check that prevents creating journals for sales that were created before accounting was deployed.

**Real-world failure mode:** The operator sets `ACCOUNTING_ACTIVATION_TIMESTAMP` to a date in the past (e.g., beginning of the fiscal year, or an old date for testing purposes). The next cron run silently journals all historical sales.

**Current protection:** Operator discipline. The documentation says the timestamp must be the go-live date.

**Recommended safeguard (not yet implemented):** Add a warning log when `activationTimestamp` is more than 24 hours in the past at the time of `onModuleInit`. This does not prevent the backfill but alerts the operator. A hard guard (refuse to scan if timestamp is >N days old) could also be added.

### When set to a date in the FUTURE

```
createdAt: { gte: new Date('2026-09-01') }
```

No sales match. Scan returns 0 items. ✓ Safe.

### When set to a malformed string (e.g., `"not-a-date"`)

```typescript
const d = new Date('not-a-date');
isNaN(d.getTime()) → true → return null
```

Treated as absent → scan skipped → ERROR logged. ✓ Safe.

---

## 5. Cron Behavior — Confirmed Inactive When Accounting is OFF

**Code:**
```typescript
@Cron('0 */15 * * * *')
async scheduledScan(): Promise<void> {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return;  // ← line 74
  ...
}
```

**Trace when `ACCOUNTING_CORE_ENABLED` is absent or `'false'`:**
```
process.env.ACCOUNTING_CORE_ENABLED !== 'true'
  undefined !== 'true' → true → return   (when absent)
  'false' !== 'true'   → true → return   (when explicitly false)
```

The `@Cron` decorator registers the method to fire every 15 minutes at the OS scheduler level. When it fires, the method executes this check within milliseconds and returns with zero DB queries, zero journal writes, zero logging (the `this.logger.log(...)` is after the guard).

**CONFIRMED: Cron is completely inactive (no observable side effect) while `ACCOUNTING_CORE_ENABLED !== 'true'`.**

---

## 6. Existing POS Behavior — Confirmed Unchanged When Accounting is OFF

**Code paths in POS flow:**

### `SalesService.create()` (after `$transaction` commits)
```typescript
await this.salesAccounting?.recordSaleJournal(sale as any, tenantId ?? '', userId);
```

1. `this.salesAccounting?` — optional chaining: if adapter is undefined (test environment), short-circuits to undefined. `await undefined` is a no-op. ✓
2. If adapter exists: `recordSaleJournal()` calls `isEnabledForTenant(tenantId)` → `false` → `return` immediately. ✓

### `SalesService.voidSale()` (after void `$transaction` commits)
```typescript
await this.salesAccounting?.reverseSaleJournal(sale as any, tenantId ?? '', userId);
```
Same path. ✓

### `SalesService.refundSaleItems()` (after refund `$transaction` commits)
```typescript
await this.salesAccounting?.recordRefundJournal(..., tenantId ?? '', userId);
```
Same path. ✓

**The `$transaction` itself is completely unchanged.** The adapter calls are post-commit, after `return sale` is set up. Even if the adapter threw an exception (it cannot — it catches internally), the sale response has already been prepared. The POS transaction cannot be affected by the adapter.

**CONFIRMED: POS behavior is byte-for-byte identical to pre-Phase-4B.1 while `ACCOUNTING_CORE_ENABLED !== 'true'`.**

---

## 7. Test Suite — Confirmed 341/341 Green

```
Test Suites: 28 passed, 28 total
Tests:       341 passed, 341 total
Snapshots:   0 total

Breakdown:
  Pre-existing (phases up to 4B.1) : 308 tests
  New T-A through T-H (allowlist)  :   8 tests   [adapter.spec.ts]
  New R01–R25 (reconciliation)     :  25 tests   [reconciliation.service.spec.ts]
```

Tests T-A and test R24 explicitly verify the fail-open behavior:

- **T-A confirms SF-1:** `expect(adapter.isEnabledForTenant(TENANT_ID)).toBe(true)` when allowlist is absent
- **R24 confirms SF-3:** `expect(prisma.branch.findMany).toHaveBeenCalledTimes(2)` — scans all tenants when allowlist absent

These tests currently PASS because the fail-open behavior is implemented as designed. If the behavior is fixed to fail-closed, these tests would need to be updated to match the new expectation. All other tests would continue to pass unchanged.

---

## 8. Safety Findings Summary

### SF-1 🔴 HIGH — Fail-open allowlist: absent = all tenants

| Item | Detail |
|------|--------|
| File | [sales-accounting.adapter.ts:72](../../backend/src/sales/sales-accounting.adapter.ts#L72) |
| Code | `if (!raw) return true; // no allowlist = all tenants enabled` |
| Risk | Setting `ACCOUNTING_CORE_ENABLED=true` without `ACCOUNTING_ENABLED_TENANTS` enables accounting for ALL tenants simultaneously |
| Test confirming behavior | T-A (passes; documents the current fail-open behavior) |

### SF-2 🔴 HIGH — Empty/whitespace allowlist = all tenants

| Item | Detail |
|------|--------|
| File | [sales-accounting.adapter.ts:71-72](../../backend/src/sales/sales-accounting.adapter.ts#L71) |
| Code | `raw = ''.trim()` = `''` → `!raw` = `true` → all tenants |
| Risk | Setting `ACCOUNTING_ENABLED_TENANTS=` (empty) in Coolify UI enables ALL tenants |

### SF-3 🔴 HIGH — Cron scan fail-open: absent allowlist scans all tenants

| Item | Detail |
|------|--------|
| File | [accounting-reconciliation.service.ts:108-115](../../backend/src/accounting-reconciliation/accounting-reconciliation.service.ts#L108) |
| Code | `allowlist === null` → `tenant.findMany()` → scan all |
| Risk | 15-minute cron touches all tenant data when allowlist is absent and `ACCOUNTING_CORE_ENABLED=true` |
| Test confirming behavior | R24 (passes; documents current behavior) |

### SF-4 🟡 MEDIUM — Past activation timestamp enables historical backfill

| Item | Detail |
|------|--------|
| File | [accounting-reconciliation.service.ts:229](../../backend/src/accounting-reconciliation/accounting-reconciliation.service.ts#L229) |
| Code | `createdAt: { gte: activationTs }` — only guarded by timestamp value |
| Risk | Setting timestamp to `2020-01-01` causes journals to be created for all historical sales |
| Mitigation | Operator discipline; documentation; no code guard exists |

### SF-5 🟢 LOW — Invalid tenant ID silently does nothing

| Item | Detail |
|------|--------|
| Risk | Typo in `ACCOUNTING_ENABLED_TENANTS` silently disables all tenants with no warning log |
| Impact | No data corruption; confusing operationally |

---

## 9. Recommended Behavior for Pilot Activation (Not Yet Implemented)

The **recommended safe default** is fail-closed:

| `ACCOUNTING_CORE_ENABLED` | `ACCOUNTING_ENABLED_TENANTS` | Recommended behavior |
|--------------------------|------------------------------|---------------------|
| absent / `false` | any | Nobody enabled ✓ |
| `true` | absent / empty / whitespace | **Nobody enabled** (change from current "all tenants") |
| `true` | `"tenant-id-1"` | Only `tenant-id-1` enabled ✓ |
| `true` | `"tenant-A,tenant-B"` | Only tenant-A and tenant-B ✓ |
| `true` | `"*"` | All tenants enabled (explicit full-rollout opt-in) |

This would require changing two lines of code — no migration, no schema change. Not making this change per review-only instruction. Awaiting owner decision.

### Safest activation sequence (current code)

Given the current fail-open behavior, the **minimum safe activation procedure** is:

```bash
# Step 1: Set allowlist FIRST (before enabling)
ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>

# Step 2: Set activation timestamp to NOW or a future time
ACCOUNTING_ACTIVATION_TIMESTAMP=2026-09-01T09:00:00+07:00

# Step 3: Enable last (atomic Coolify env save that includes all three)
ACCOUNTING_CORE_ENABLED=true
```

All three variables must be saved in a **single atomic deployment action** in Coolify, not applied individually. If Coolify applies env vars one at a time between restarts, there is a window between enabling `ACCOUNTING_CORE_ENABLED=true` and setting `ACCOUNTING_ENABLED_TENANTS` where all tenants are enabled.

---

## 10. Conclusion

**Phase 4B.2 implementation is correct relative to its intended design.** The cron is inactive when accounting is off. POS is unchanged. 341 tests pass. Historical sales are protected by the activation timestamp guard — when the timestamp is absent (current production state).

**One design decision in the implementation is unsafe for a multi-tenant SaaS pilot:** the fail-open allowlist default (SF-1, SF-2, SF-3). The code as written treats "no allowlist" as "all tenants" — appropriate for a full rollout but dangerous for a pilot on a live system with real customers.

**This review recommends fixing SF-1/SF-2/SF-3 before any production activation.** The fix is a two-line code change. No schema migration is required.

**No production data was accessed. No code was changed. No accounting was enabled.**

---

## STOPPED

Not proceeding further.

Awaiting owner decision on:
1. Whether to fix SF-1/SF-2/SF-3 (change allowlist default from fail-open to fail-closed) before deployment
2. Whether to proceed with the current code (with documented activation risk) and rely on operator discipline
3. Production deployment approval

---

## RESOLUTION — Phase 4B.2.2 (2026-08-18)

Owner approved fail-closed fix. All four findings resolved in Phase 4B.2.2. See [PHASE_4B2_2_FAIL_CLOSED_FIX.md](./PHASE_4B2_2_FAIL_CLOSED_FIX.md) for full details.

| Finding | Status | Fix |
|---------|--------|-----|
| SF-1 🔴 HIGH | **FIXED** | `isEnabledForTenant()`: absent → `return false` |
| SF-2 🔴 HIGH | **FIXED** | `isEnabledForTenant()`: empty/whitespace → `return false` |
| SF-3 🔴 HIGH | **FIXED** | `getEnabledTenantIds()` returns `DISABLED` mode → scan returns empty |
| SF-4 🟡 MEDIUM | **FIXED** | `validateActivationTimestamp()`: age >24h → error + scan blocked |
| SF-5 🟢 LOW | Deferred | No change — typo in allowlist still silently skips; acceptable |

**Tests:** 341 → 352 (11 new tests for fail-closed scenarios)  
**Production changes:** NONE — accounting activation flags still all unset
