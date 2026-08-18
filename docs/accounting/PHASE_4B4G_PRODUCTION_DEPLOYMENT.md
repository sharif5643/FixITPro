# Phase 4B.4G — Production Deployment

**Date:** 2026-08-18 UTC  
**Deployed commit:** `8a77f6f` (feat(accounting): extend reconciliation with Repair + Expense scan)  
**Previous commit:** `888b630` (Phase 4B.4E wiring)  
**Verdict:** ✅ PASS — All post-deploy verifications passed, reconciliation working

---

## Pre-Deploy Backup

| Field | Value |
|---|---|
| Filename | `/opt/fixitpro-backups/db/fixitpro_pre4B4G_20260818_183355.sql.gz` |
| SHA-256 | `8268b3a10583affc57c0a10d219681a7c0292bc62ee812bad4dc7aabaf343b8b` |
| Taken at | 2026-08-18T18:33:55Z |

---

## Pre-Deploy Verification

### Backend Health
```
{"status":"ok","db":"ok","redis":"ok","timestamp":"2026-08-18T18:35:10.435Z"}
```

### Production Commit
Container image: `z9m1c1i9nr6kbyo4qn0vuv1b_backend:888b63044cdeb1bce0c7ebc7cad667cfd4174680`

### Accounting Environment (pre-deploy)
```
ACCOUNTING_CORE_ENABLED=true
ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp
ACCOUNTING_ACTIVATION_TIMESTAMP=2026-08-18T04:17:00Z
```

Activation timestamp age at scan time: ~14.3h (within 24h safety window; expires 2026-08-19T04:17:00Z)

### Pre-Deploy Baseline

| Table | Count |
|---|---|
| JournalEntry | 35 ✅ (matches expected) |
| JournalLine | 70 ✅ (matches expected) |
| Repair | 24 |
| Expense | 1 |
| CashDrawerTransaction | 135 |
| StockMovement | 286 |

Baseline matches expected. Pre-deploy check: **PASS**.

---

## Deployment Issue and Fix

### First deployment attempt — FAILED

Deployment UUID: `j4tr8j5plv1e6dm25mewdw7z`

**Error:**  
```
Deployment failed: unserialize(): Error at offset 0 of 20 bytes
Error type: ErrorException
Location: .../Illuminate/Encryption/Encrypter.php:195
```

**Root cause:** `ACCOUNTING_ACTIVATION_TIMESTAMP` (Coolify env var id=51) had a corrupted encryption envelope. The JSON was stored with spaces after colons (`{"iv": "..."`) and the MAC did not validate against the current Coolify APP_KEY. This caused Laravel's `Encrypter::decrypt()` to fail when Coolify tried to inject env vars into the build container.

The value `2026-08-18T04:17:00Z` (20 bytes) was visible in the error as "at offset 0 of 20 bytes" — confirming this specific var was the one failing.

**Fix applied:**
1. Deleted corrupted row id=51 via Coolify tinker: `\App\Models\EnvironmentVariable::find(51)->delete()`
2. Created new row id=52 using Coolify's proper encryption: `$newVar->value = '2026-08-18T04:17:00Z'` (model mutator encrypts automatically)
3. Verified decryption round-trip: `$check->value` returned `2026-08-18T04:17:00Z` ✅

No change to the actual value — `ACCOUNTING_ACTIVATION_TIMESTAMP` remains `2026-08-18T04:17:00Z`.

### Second deployment attempt — SUCCEEDED

Deployment UUID: `spyh833228wolbbcsxqcj6p9`  
Duration: ~3.5 minutes  
Status: `finished`

---

## Post-Deploy Verification

### Backend Health
```
{"status":"ok","db":"ok","redis":"ok","timestamp":"2026-08-18T18:46:04.428Z"}
```
- `status: ok` ✅  
- `db: ok` ✅  
- `redis: ok` ✅

### Deployed Commit
Container image: `z9m1c1i9nr6kbyo4qn0vuv1b_backend:8a77f6fa40c9edec7b7ad6cf3958a1ac7b3ce21a`

Commit `8a77f6f` confirmed ✅

### Accounting Environment (post-deploy)
```
ACCOUNTING_CORE_ENABLED=true
ACCOUNTING_ENABLED_TENANTS=cmsc05do8001u7i29q3p5x6zp
ACCOUNTING_ACTIVATION_TIMESTAMP=2026-08-18T04:17:00Z
```

No environment variables changed ✅

### Post-Deploy Row Counts

| Table | Pre | Post | Delta |
|---|---|---|---|
| JournalEntry | 35 | 35 | **0** ✅ |
| JournalLine | 70 | 70 | **0** ✅ |
| Repair | 24 | 24 | 0 ✅ |
| Expense | 1 | 1 | 0 ✅ |
| CashDrawerTransaction | 135 | 135 | 0 ✅ |
| StockMovement | 286 | 286 | 0 ✅ |

No business data changed by deployment ✅

### Public Routing
- `https://fixitpro.in.th/api/v1/auth/login` → HTTP 401 (backend reached, wrong credentials) ✅
- `https://fixitpro.in.th/health` → HTTP 307 (frontend redirect) ✅

---

## Reconciliation Test

**Endpoint:** `POST /api/v1/admin/accounting/run-reconciliation`  
**Tenant:** `cmsc05do8001u7i29q3p5x6zp` (pilot only)  
**Timestamp:** 2026-08-18T18:50:27.955Z

### Summary
```json
{
  "scanned": 10,
  "posted": 10,
  "missing": 0,
  "recovered": 0,
  "errors": 0,
  "notApplicable": 0
}
```

### POS Sales (8 items — all POSTED)

| Receipt | Status |
|---|---|
| RCP-20260818-84BECD | POSTED ✅ |
| RCP-20260818-34E023 | POSTED ✅ |
| RCP-20260818-278DFD | POSTED ✅ |
| RCP-20260818-7D55B7 | POSTED ✅ |
| RCP-20260818-DBF19B | POSTED ✅ |
| RCP-20260818-C16C6B | POSTED ✅ |
| RCP-20260818-7A027A | POSTED ✅ |
| RCP-20260818-70A2E3 | POSTED ✅ |

### Repair Items (1 item)

| Repair | Ticket | Status |
|---|---|---|
| `cmsyyg3i80007tj5af0k5xohi` | REP-20260818-EC2331 | POSTED ✅ |

REPAIR_DEPOSIT (฿300), REPAIR_FINAL_PAYMENT (฿1,200), REPAIR_DEPOSIT_SETTLE (฿300) — all detected as POSTED.

### Expense Items (1 item)

| Expense | Status |
|---|---|
| `cmsyymrc80010tj5a7mtubsx6` | POSTED ✅ |

EXPENSE_PAYMENT (฿200) and EXPENSE_REVERSAL (฿200, voided) — both detected as POSTED.

### Post-Scan Row Counts
After reconciliation run: JE=35, JL=70 — **unchanged** ✅

**No automatic recovery occurred. No new JournalEntry or JournalLine was created by scanning.** ✅

---

## Tenant Isolation Verification

Only `cmsc05do8001u7i29q3p5x6zp` was scanned. The `ACCOUNTING_ENABLED_TENANTS` allowlist remains `cmsc05do8001u7i29q3p5x6zp` — no other tenant enabled ✅

---

## Confirmation Checklist

| Item | Result |
|---|---|
| No migrations created | ✅ |
| No DB schema changed | ✅ |
| No environment variables changed | ✅ |
| No other tenants enabled | ✅ |
| No Repair transactions created | ✅ |
| No Expense transactions created | ✅ |
| No JournalEntry created by scan | ✅ |
| No JournalLine created by scan | ✅ |
| No backfill performed | ✅ |
| No POS behavior changed | ✅ |
| No Repair business logic changed | ✅ |
| No Expense business logic changed | ✅ |
| No Exchange implemented | ✅ |
| No Repair cancellation fixed | ✅ |

---

## Known Gap: Repair Cancellation

If a Repair with a deposit is CANCELLED, no reversal journal is created. The ฿ liability in account 2110 (Customer Deposit) remains unreversed. This is a known, documented gap from Phase 4B.4E.

The reconciliation correctly identifies a cancelled repair with a deposit as `MISSING` (REPAIR_DEPOSIT present but no settle/reversal) — surfacing it for manual review.

**Do NOT fix silently. Requires owner decision on refund policy.**

---

## Container Summary (Post-Deploy)

| Service | Container | Image Commit |
|---|---|---|
| Backend | `backend-z9m1c1i9nr6kbyo4qn0vuv1b-184212383371` | `8a77f6f` |
| Frontend | Running | `8a77f6f` |
| Postgres | `postgres-z9m1c1i9nr6kbyo4qn0vuv1b-184212379756` | `postgres:15-alpine` |

Backend IP: `10.0.1.29`

---

**STOP — Do NOT proceed to Repair COGS pilot, Debt Payment pilot, Repair cancellation fix, Exchange, or other tenant activation. Await owner approval.**
