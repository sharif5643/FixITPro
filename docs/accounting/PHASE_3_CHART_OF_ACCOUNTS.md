# Phase 3 — Chart of Accounts Infrastructure

**Status:** COMPLETE  
**Date:** 2026-08-17  
**Scope:** Infrastructure only — no production seeding, no JournalEntry creation, no existing module changes

---

## Summary

Phase 3 adds the Chart of Accounts layer on top of the `AccountingAccount` model created in Phase 2. It provides a 17-account standard template, an idempotent tenant initializer, admin-only REST endpoints, and full test coverage.

---

## Files Created

### Constants

| File | Purpose |
|------|---------|
| `backend/src/accounting-accounts/constants/chart-of-accounts.ts` | 17-account `CHART_OF_ACCOUNTS_TEMPLATE` (readonly), `COA_TEMPLATE_COUNT = 17` |
| `backend/src/accounting-accounts/constants/account-codes.ts` | `ACCOUNT_CODES` map for use by future journal services |

### DTOs

| File | Fields |
|------|--------|
| `dto/initialize-accounts.dto.ts` | Optional `tenantId` (SUPER_ADMIN override only) |
| `dto/create-account.dto.ts` | `code` (4-10 numeric digits), `name`, `nameTh`, `type` (AccountType), optional `subType`, `sortOrder` |
| `dto/update-account.dto.ts` | Partial: `name`, `nameTh`, `subType`, `sortOrder`, `isActive` (code is immutable) |

### Service

`backend/src/accounting-accounts/accounting-accounts.service.ts`

| Method | Behaviour |
|--------|-----------|
| `initializeForTenant(tenantId)` | Idempotent: reads existing codes, calls `createMany({ skipDuplicates: true })` for missing only |
| `dryRunForTenant(tenantId)` | Returns `{ existingCount, missingCount, wouldCreate, existing[], missing[] }` — no writes |
| `listForTenant(tenantId)` | Returns all accounts ordered by type → sortOrder → code |
| `createCustom(tenantId, dto)` | Checks for duplicate code first; creates with `isSystem: false` |
| `update(id, tenantId, dto)` | Cross-tenant check; updates allowed fields only |
| `deactivate(id, tenantId)` | Blocked by `ConflictException` if `journalLine.count > 0` |
| `activate(id, tenantId)` | Sets `isActive: true`; no pre-condition check needed |
| `resolveByCode(code, tenantId)` | Used by future journal services; throws if missing or inactive |

### Controller

`backend/src/accounting-accounts/accounting-accounts.controller.ts`

All endpoints require `JwtAuthGuard` + `RolesGuard` → `OWNER` or `SUPER_ADMIN`.

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/v1/accounting/accounts` | List all accounts for caller's tenant |
| POST   | `/api/v1/accounting/accounts/dry-run` | Preview without writing |
| POST   | `/api/v1/accounting/accounts/initialize` | Initialize standard accounts (idempotent) |
| POST   | `/api/v1/accounting/accounts` | Create a custom account |
| PATCH  | `/api/v1/accounting/accounts/:id` | Update name/subType/sortOrder/isActive |
| PATCH  | `/api/v1/accounting/accounts/:id/activate` | Re-activate an account |
| PATCH  | `/api/v1/accounting/accounts/:id/deactivate` | Deactivate (blocked if referenced by journal lines) |

SUPER_ADMIN can pass `tenantId` in the body of `dry-run` and `initialize` to target another tenant.

### Module & App

- `accounting-accounts.module.ts` — registers controller, service, RolesGuard; exports service
- `app.module.ts` — `AccountingAccountsModule` added after `AccountingModule`

---

## Standard Chart of Accounts (17 accounts)

| Code | Name (EN) | Name (TH) | Type |
|------|-----------|-----------|------|
| 1100 | Cash on Hand | เงินสดในมือ | ASSET |
| 1110 | Bank Deposit | เงินฝากธนาคาร | ASSET |
| 1120 | Transfer/Card Clearing | Transfer/Card Clearing | ASSET |
| 1200 | Repair Accounts Receivable | ลูกหนี้งานซ่อม | ASSET |
| 1210 | Other Accounts Receivable | ลูกหนี้อื่น | ASSET |
| 1300 | Inventory | สินค้าคงเหลือ | ASSET |
| 1310 | Repair Parts Inventory | อะไหล่คงเหลือ | ASSET |
| 2100 | Accounts Payable | เจ้าหนี้การค้า | LIABILITY |
| 2110 | Customer Deposit | เงินมัดจำลูกค้า | LIABILITY |
| 3100 | Owner's Equity | ทุนเจ้าของ | EQUITY |
| 4100 | Sales Revenue | รายได้จากการขาย | REVENUE |
| 4200 | Repair Revenue | รายได้จากงานซ่อม | REVENUE |
| 4300 | Package Revenue | รายได้แพ็คเกจ | REVENUE |
| 5100 | Cost of Goods Sold | ต้นทุนสินค้า | EXPENSE |
| 5200 | Repair Parts Cost | ต้นทุนอะไหล่ซ่อม | EXPENSE |
| 6100 | Operating Expenses | ค่าใช้จ่ายดำเนินงาน | EXPENSE |
| 6200 | Other Expenses | ค่าใช้จ่ายอื่น | EXPENSE |

---

## Tests

`backend/src/accounting-accounts/accounting-accounts.service.spec.ts` — 16 tests

| # | Case |
|---|------|
| 1 | `initializeForTenant` creates 17 accounts for a new tenant |
| 1b | `createMany` called with `skipDuplicates: true` and correct data shape |
| 2 | Second call to `initializeForTenant` returns `created=0`, skips all 17 |
| 3 | Idempotent across two calls — `createMany` called only once |
| 4 | Race condition handled — `skipDuplicates` absorbs partial-create without throw |
| 5 | All created accounts carry `tenantId` of target tenant, not another |
| 6 | `NotFoundException` when tenant does not exist |
| 7 | `ConflictException` when deactivating account referenced by journal lines |
| 7b | Can deactivate account with zero journal line references |
| 8 | `ConflictException` on `createCustom` with duplicate code |
| 8b | `createCustom` succeeds when code is unique; sets `isSystem: false` |
| 9 | `dryRunForTenant` returns correct counts without writing |
| 10 | `ForbiddenException` on `update` for account belonging to different tenant |
| 11 | `resolveByCode` throws `ConflictException` for inactive account |
| 11b | `resolveByCode` throws `NotFoundException` for unknown code |
| 12 | `activate` sets `isActive: true` for a deactivated account |

**Result: 245/245 tests pass** (229 pre-existing + 16 new)

---

## Safety Constraints Honored

- No `JournalEntry` or `JournalLine` created
- No changes to POS, Repair, Stock, Purchase, or Expense modules
- No production tenant seeding
- `ACCOUNTING_CORE_ENABLED` feature flag NOT enabled
- No existing data modified
- Migration #69 tables remain empty

---

## What Is NOT Done (by design)

1. **Auto-seeding on new tenant creation** — Deliberately omitted. `TenantsService.create()` runs in a `$transaction` on PENDING tenants; injecting account creation there adds risk. Admin must call `POST /api/v1/accounting/accounts/initialize` explicitly.
2. **Production tenant seeding** — Requires explicit owner approval per tenant. Use dry-run first to preview.
3. **Journal entries from real transactions** — Phase 4+.
4. **Backfill of historical data** — Out of scope.

---

## Next Steps (Phase 4+, requires approval)

1. Initialize accounts for production tenants via `POST /accounting/accounts/initialize`
2. Implement `JournalEntryService` with double-entry validation (debit = credit)
3. Wire `AccountingService.record()` to create `JournalEntry` + `JournalLine` records
4. Reporting: trial balance, P&L, balance sheet endpoints
