# Phase 4B.2.2 — Fail-Closed Safety Fix

**Status:** COMPLETE — NOT YET ENABLED IN PRODUCTION  
**Date:** 2026-08-18  
**Resolves:** SF-1, SF-2, SF-3 (HIGH) and SF-4 (MEDIUM) from [PHASE_4B2_1_FINAL_SAFETY_REVIEW.md](./PHASE_4B2_1_FINAL_SAFETY_REVIEW.md)  
**Feature flags:** Still OFF in production — no activation occurred

---

## Summary

Phase 4B.2 implemented an allowlist with a fail-open default (absent allowlist = all tenants enabled). The Phase 4B.2.1 safety review identified this as three HIGH-severity findings. Phase 4B.2.2 changes the allowlist to fail-closed and adds a 24-hour hard guard on the activation timestamp.

---

## 1. Changes Made

| File | Change |
|------|--------|
| `backend/src/sales/sales-accounting.adapter.ts` | `isEnabledForTenant()` rewritten: fail-closed + `"*"` sentinel |
| `backend/src/sales/sales-accounting.adapter.spec.ts` | T-A updated; T-I through T-L added (4 new tests) |
| `backend/src/accounting-reconciliation/accounting-reconciliation.service.ts` | `AllowlistResult` type, `ActivationCheck` type, `validateActivationTimestamp()`, `getEnabledTenantIds()` redesigned |
| `backend/src/accounting-reconciliation/accounting-reconciliation.service.spec.ts` | R24 updated; R26–R32 added (7 new tests); `ACTIVATION_TS` made dynamic |
| `docs/accounting/PHASE_4B2_1_FINAL_SAFETY_REVIEW.md` | RESOLUTION section appended |
| `docs/accounting/PHASE_4B2_2_FAIL_CLOSED_FIX.md` | **NEW** — this document |

---

## 2. SF-1 + SF-2 Fix — `isEnabledForTenant()` Fail-Closed

### Before (Phase 4B.2 — fail-open)

```typescript
isEnabledForTenant(tenantId: string): boolean {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false;
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
  if (!raw) return true; // no allowlist = all tenants enabled  ← UNSAFE
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(tenantId);
}
```

### After (Phase 4B.2.2 — fail-closed)

```typescript
isEnabledForTenant(tenantId: string): boolean {
  if (process.env.ACCOUNTING_CORE_ENABLED !== 'true') return false;
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
  if (!raw) return false;       // fail-closed: absent/empty = nobody enabled
  if (raw === '*') return true; // explicit full-rollout sentinel
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return allowed.includes(tenantId);
}
```

### New behavior table

| `ACCOUNTING_CORE_ENABLED` | `ACCOUNTING_ENABLED_TENANTS` | Result |
|--------------------------|------------------------------|--------|
| absent / `false` | any | `false` — nobody |
| `true` | absent | `false` — nobody (fail-closed) |
| `true` | `""` (empty) | `false` — nobody (fail-closed) |
| `true` | `"   "` (whitespace) | `false` — nobody (fail-closed) |
| `true` | `"*"` | `true` — all tenants (explicit) |
| `true` | `"tenant-A"` | `true` for tenant-A only |
| `true` | `"tenant-A,tenant-B"` | `true` for A and B only |

---

## 3. SF-3 Fix — `getEnabledTenantIds()` Explicit Type (No Null Semantics)

### Before (Phase 4B.2 — ambiguous null)

```typescript
private getEnabledTenantIds(): string[] | null {
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
  if (!raw) return null;  // null = "scan all tenants" — UNSAFE AND AMBIGUOUS
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

// Caller:
const allowlist = this.getEnabledTenantIds();
if (allowlist !== null) {
  return this.scanTenants(allowlist, activationTs, null);
}
// Full-rollout mode (no allowlist): scan all tenants
const tenants = await this.prisma.tenant.findMany({ ... });
```

### After (Phase 4B.2.2 — explicit discriminated union)

```typescript
type AllowlistResult =
  | { mode: 'DISABLED' }                            // no allowlist → nobody enabled
  | { mode: 'TENANT_LIST'; tenantIds: string[] }    // pilot list
  | { mode: 'ALL_TENANTS' };                        // '*' sentinel → explicit full-rollout

private getEnabledTenantIds(): AllowlistResult {
  const raw = (process.env.ACCOUNTING_ENABLED_TENANTS ?? '').trim();
  if (!raw) return { mode: 'DISABLED' };
  if (raw === '*') return { mode: 'ALL_TENANTS' };
  const tenantIds = raw.split(',').map(s => s.trim()).filter(Boolean);
  return { mode: 'TENANT_LIST', tenantIds };
}

// Caller (updated runReconciliation):
const allowlist = this.getEnabledTenantIds();

if (allowlist.mode === 'DISABLED') {
  this.logger.warn('Accounting core enabled but no tenant allowlist configured; accounting remains disabled.');
  return this.emptyReport(null);
}

if (allowlist.mode === 'ALL_TENANTS') {
  this.logger.warn('Accounting full rollout explicitly enabled.');
  const tenants = await this.prisma.tenant.findMany({ select: { id: true } });
  return this.scanTenants(tenants.map(t => t.id), activationTs, null);
}

// TENANT_LIST
return this.scanTenants(allowlist.tenantIds, activationTs, null);
```

---

## 4. SF-4 Fix — 24-Hour Activation Timestamp Guard

### Before (Phase 4B.2 — no age guard)

Any valid date, including `2020-01-01`, passed through. A far-past timestamp caused the scan to process all historical sales.

### After (Phase 4B.2.2 — 24-hour hard guard)

```typescript
const ACTIVATION_MAX_AGE_HOURS = 24;
const ACTIVATION_MAX_AGE_MS    = ACTIVATION_MAX_AGE_HOURS * 60 * 60 * 1000;

type ActivationCheck =
  | { ok: true;  date: Date }
  | { ok: false; reason: 'MISSING' | 'INVALID' | 'TOO_OLD'; message: string };

private validateActivationTimestamp(): ActivationCheck {
  const ts = process.env.ACCOUNTING_ACTIVATION_TIMESTAMP;
  if (!ts) {
    return { ok: false, reason: 'MISSING', message: 'ACCOUNTING_ACTIVATION_TIMESTAMP not set' };
  }
  const d = new Date(ts);
  if (isNaN(d.getTime())) {
    return { ok: false, reason: 'INVALID',
             message: `ACCOUNTING_ACTIVATION_TIMESTAMP "${ts}" is not a valid ISO 8601 date` };
  }
  const ageMs = Date.now() - d.getTime();
  if (ageMs > ACTIVATION_MAX_AGE_MS) {
    return { ok: false, reason: 'TOO_OLD',
             message: `ACCOUNTING_ACTIVATION_TIMESTAMP is ${Math.round(ageMs / 3_600_000)}h old, exceeds ${ACTIVATION_MAX_AGE_HOURS}h safety window` };
  }
  return { ok: true, date: d };
}
```

**In `runReconciliation()`:**

```typescript
const activation = this.validateActivationTimestamp();
if (activation.ok === false) {
  if (activation.reason === 'TOO_OLD') {
    this.logger.error(
      'Accounting activation timestamp is older than allowed safety window; reconciliation blocked.',
    );
  } else {
    this.logger.error(`AccountingReconciliationService: ${activation.message} — scan skipped.`);
  }
  return this.emptyReport(options?.tenantId ?? null);
}
const activationTs = activation.date;
```

### Guard behavior table

| `ACCOUNTING_ACTIVATION_TIMESTAMP` | Result |
|----------------------------------|--------|
| absent | ERROR + empty (MISSING) |
| `"not-a-date"` | ERROR + empty (INVALID) |
| `"2020-01-01T00:00:00Z"` (>24h ago) | ERROR + empty (TOO_OLD) |
| `"<yesterday minus 1 second>"` (>24h ago) | ERROR + empty (TOO_OLD) |
| `"<2 hours ago>"` (<24h ago) | Valid — scan proceeds |
| `"<1 minute ago>"` (<24h ago) | Valid — scan proceeds |
| `"<now>"` | Valid — scan proceeds |
| `"<future date>"` | Valid (age is negative) — scan proceeds |

**Activation procedure impact:** The timestamp must be set within 24 hours of activating the accounting. Set it at the time of activation (or slightly before), not weeks/months in advance.

---

## 5. Log Messages Added

| Situation | Level | Message |
|-----------|-------|---------|
| CORE=true + no allowlist (DISABLED mode) | WARN | `"Accounting core enabled but no tenant allowlist configured; accounting remains disabled."` |
| CORE=true + `"*"` allowlist (ALL_TENANTS mode) | WARN | `"Accounting full rollout explicitly enabled."` |
| Timestamp absent | ERROR | `"AccountingReconciliationService: ACCOUNTING_ACTIVATION_TIMESTAMP not set — scan skipped."` |
| Timestamp invalid | ERROR | `"AccountingReconciliationService: ACCOUNTING_ACTIVATION_TIMESTAMP "…" is not a valid ISO 8601 date — scan skipped."` |
| Timestamp >24h old | ERROR | `"Accounting activation timestamp is older than allowed safety window; reconciliation blocked."` |

---

## 6. Test Changes

### Updated tests

| Test | Was | Now |
|------|-----|-----|
| T-A | "absent allowlist → all tenants enabled (full-rollout)" | "absent allowlist → nobody enabled (fail-closed)" |
| R24 | "absent allowlist → scans all tenants from DB" | "absent allowlist → fail-closed: zero tenants scanned" |

### New tests

| ID | Scenario |
|----|----------|
| T-I | flag ON + empty string allowlist → nobody enabled (fail-closed) |
| T-J | flag ON + whitespace-only allowlist → nobody enabled (fail-closed) |
| T-K | flag ON + `"*"` sentinel → all tenants enabled (explicit full-rollout) |
| T-L | flag ON + `"*"` sentinel → journal created for any tenant |
| R26 | activation timestamp invalid string → empty report + ERROR logged |
| R27 | activation timestamp in future → valid, scan proceeds |
| R28 | activation timestamp <24h past → valid, scan proceeds |
| R29 | activation timestamp >24h past → blocked, ERROR logged |
| R30 | historical sale excluded by fresh activation timestamp (DB query uses `createdAt.gte`) |
| R31 | scheduledScan with CORE=true but no allowlist → DISABLED mode, warning logged |
| R32 | `ACCOUNTING_ENABLED_TENANTS="*"` → ALL_TENANTS mode, all tenants scanned |

### Test results

```
Test Suites: 28 passed, 28 total
Tests:       352 passed, 352 total
Snapshots:   0 total

Breakdown:
  Pre-existing (phases up to 4B.1)        : 308
  Phase 4B.2 allowlist tests (T-A…T-H)    :   8  → 4 remain, T-A updated
  Phase 4B.2 reconciliation tests (R01–R25):  25  → 25 remain, R24 updated
  Phase 4B.2.2 new allowlist (T-I…T-L)    :   4
  Phase 4B.2.2 new reconciliation (R26–R32):   7
  Total                                   : 352
```

---

## 7. Activation Procedure (Updated for 4B.2.2)

With fail-closed semantics, the activation procedure is safer:

```bash
# In Coolify environment variables (backend container) — set all three atomically:
ACCOUNTING_CORE_ENABLED=true
ACCOUNTING_ACTIVATION_TIMESTAMP=<current ISO 8601 timestamp>  # set to NOW or slightly in the past (max 24h)
ACCOUNTING_ENABLED_TENANTS=<pilot_tenant_id>
```

**Key change from 4B.2:** You no longer need to worry about the order of env var application. Even if `ACCOUNTING_CORE_ENABLED=true` is applied before `ACCOUNTING_ENABLED_TENANTS`, accounting remains disabled (fail-closed) until the allowlist is set.

**Activation timestamp restriction:** Must be within 24 hours of the activation time. Setting it to a future date (e.g., the planned go-live date) is valid — the scan will find no sales until that date is reached.

---

## 8. What Is NOT Changed

- No schema migration
- No production JournalEntry created
- No POS behavior changed
- No deployment occurred
- `ACCOUNTING_CORE_ENABLED` remains unset in production
- `ACCOUNTING_ENABLED_TENANTS` remains unset in production
- `ACCOUNTING_ACTIVATION_TIMESTAMP` remains unset in production

---

## STOPPED

Not proceeding further.

Awaiting owner approval before:
- Setting any accounting env vars in production
- Deploying Phase 4B.1 + 4B.2 + 4B.2.2 build to production
- Proceeding to Phase 4B.3 (Repair/Expense journal entries)
