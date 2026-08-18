# Phase 4B.3A — Tenant Accounting Initialization Audit

**Date:** 2026-08-18  
**Status:** COMPLETE — READ-ONLY AUDIT  
**Accounting:** OFF in production (no env vars set)  
**Next step:** Owner selects pilot tenant → Phase 4B.3B initialization

---

## 1. Initialization System Overview

The Chart of Accounts is initialized per-tenant via `AccountingAccountsService.initializeForTenant(tenantId)`.

### How it works

```
POST /api/v1/accounting/accounts/initialize
  ↓
AccountingAccountsController.initialize()
  ↓ OWNER scoped to callerTenantId; SUPER_ADMIN can pass ?tenantId=
AccountingAccountsService.initializeForTenant(tenantId)
  1. findUnique(tenant) → NotFoundException if missing
  2. findMany(accountingAccount, where: { tenantId })  → existing codes set
  3. filter CHART_OF_ACCOUNTS_TEMPLATE against existing codes
  4. if nothing to create → return { created:0, skipped:N, total:17 }
  5. createMany({ data: [...], skipDuplicates: true })
  6. return { tenantId, created, skipped, total }
```

### Template: 17 standard accounts

| Code | English Name | Thai Name | Type |
|------|-------------|-----------|------|
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

## 2. Safety Properties

### 2a. Idempotency

**VERIFIED: YES**

```typescript
const existing = await this.prisma.accountingAccount.findMany({
  where:  { tenantId },
  select: { code: true },
});
const existingCodes = new Set(existing.map(a => a.code));
const toCreate = CHART_OF_ACCOUNTS_TEMPLATE.filter(t => !existingCodes.has(t.code));

if (toCreate.length === 0) {
  return { tenantId, created: 0, skipped: existing.length, total: COA_TEMPLATE_COUNT };
}

await this.prisma.accountingAccount.createMany({
  data: toCreate.map(t => ({ ...t, tenantId })),
  skipDuplicates: true,  // ← absorbs any race duplicates at DB level
});
```

- First call with empty tenant → creates 17 accounts
- Second call → `toCreate.length === 0` → returns early, **zero DB writes**
- `createMany` with `skipDuplicates: true` as a second safety layer against any gap

**Test coverage:** Tests 2 and 3 confirm this behavior.

### 2b. Tenant Isolation

**VERIFIED: YES — three layers**

1. **Schema constraint:** `@@unique([code, tenantId])` — the composite unique key means `code='1100'` for tenant A and `code='1100'` for tenant B are two separate rows. No code can accidentally resolve to a different tenant.

2. **Application stamping:** Every account created by `initializeForTenant(tenantId)` has `tenantId` explicitly set on every row in the `createMany` call. No inherited or default tenant.

3. **JournalService resolution:** `resolveAccounts()` uses `findUnique({ where: { code_tenantId: { code, tenantId } } })` — the composite key lookup makes cross-tenant resolution structurally impossible. Even if an attacker passes a valid code, it can only resolve to their own tenant's row.

**Test coverage:** Test 5 confirms all rows have the target `tenantId`; Test 10 confirms cross-tenant update is rejected with `ForbiddenException`.

### 2c. Branch Safety

**VERIFIED: YES**

`initializeForTenant()` creates `AccountingAccount` records only. These are **tenant-level** entities — not branch-level. Branches are referenced only in `JournalEntry.branchId` (set at journal-posting time), not in the COA.

A tenant with multiple branches shares one Chart of Accounts. Journal entries are posted with `branchId` for reporting purposes, but account resolution is always by `(code, tenantId)` — branch has no role in account lookup.

Multi-branch tenants (e.g., `ร้านชาริฟพีซี@ออล์` with 2 branches) can safely be initialized — they get one shared COA, and each branch's journals reference the same set of accounts.

### 2d. Race Safety

**VERIFIED: YES**

```typescript
// createMany with skipDuplicates handles race conditions atomically
const result = await this.prisma.accountingAccount.createMany({
  data: toCreate.map(t => ({ ...t, tenantId })),
  skipDuplicates: true,
});
```

If two requests call `initializeForTenant(tenantId)` simultaneously:
- Both read `existingCodes = []`
- Both attempt to insert 17 rows
- PostgreSQL enforces the `UNIQUE(code, tenantId)` constraint
- `skipDuplicates: true` maps to `INSERT ... ON CONFLICT DO NOTHING`
- One request creates all 17; the other creates 0 — no error thrown

**Test coverage:** Test 4 simulates this scenario (mock returns count=10 from a concurrent init).

---

## 3. Accounts Required by SalesAccountingAdapter

The adapter uses exactly 5 accounts:

| Code | Constant | Role in POS Journal |
|------|----------|---------------------|
| `1100` | `ACCOUNT_CODES.CASH` | Debit leg — cash payment received |
| `1120` | `ACCOUNT_CODES.CLEARING` | Debit leg — transfer/card payment received |
| `4100` | `ACCOUNT_CODES.SALES_REVENUE` | Credit leg — revenue recognized |
| `5100` | `ACCOUNT_CODES.COGS` | Debit leg — cost of goods sold |
| `1300` | `ACCOUNT_CODES.INVENTORY` | Credit leg — inventory reduced |

**All 5 are present in `CHART_OF_ACCOUNTS_TEMPLATE`** — verified by new test 13 (template completeness).

**Journal entry flow per sale:**

For each `SalePayment`:
```
DR 1100 Cash / 1120 Clearing       (payment amount net of change)
  CR 4100 Sales Revenue
```

For each `SaleItem` with `costPrice > 0`:
```
DR 5100 COGS                       (costPrice × quantity)
  CR 1300 Inventory
```

---

## 4. Account Code Uniqueness

**Schema enforcement:** `@@unique([code, tenantId])` + `@@index([tenantId])`

- Code `1100` can exist exactly once per tenant
- Attempting to create a duplicate via `createCustom()` throws `ConflictException` before the DB write
- `initializeForTenant()` uses `createMany` with `skipDuplicates: true` — duplicates silently ignored, no unique constraint violation surfaces to callers

---

## 5. Inactive Account Rejection

**Verified in two places:**

**`AccountingAccountsService.resolveByCode()`:**
```typescript
if (!account.isActive) throw new ConflictException(`Account ${code} is inactive`);
```

**`JournalService.resolveAccounts()`:**
```typescript
if (!account.isActive) {
  throw new ConflictException(`Line ${idx + 1}: account "${line.accountCode}" is inactive`);
}
```

Any attempt to post a journal against an inactive account fails before any DB write. The `JournalService.create()` calls `resolveAccounts()` at the very start, so no partial entry is ever created.

**Test coverage:** Test 11 confirms `ConflictException` on inactive account; Test 11b confirms `NotFoundException` on missing account.

---

## 6. Cross-Tenant Account Resolution — Impossible

**Schema:** The `findUnique({ where: { code_tenantId: { code, tenantId } } })` lookup in `JournalService.resolveAccounts()` means:

- Passing `code='1100'` and `tenantId='tenant-A'` can ONLY return tenant-A's row
- There is no path to resolve tenant-B's account `1100` while posting for tenant-A
- The composite index key is a structural barrier, not just a runtime check

**`AccountingAccountsService.update/deactivate/activate`:**
```typescript
if (account.tenantId !== tenantId) throw new ForbiddenException('Cross-tenant access denied');
```
Even if an account ID leaks, the explicit ownership check prevents modification.

**Test coverage:** Test 10 confirms update is rejected with `ForbiddenException`.

---

## 7. Idempotency Verification

| Scenario | First call | Second call |
|----------|-----------|-------------|
| Brand-new tenant | Creates 17 | Creates 0 |
| Partially initialized | Creates N missing | Creates 0 |
| Concurrent calls | One creates 17, other creates 0 (DB conflict absorbed) | — |
| Template expanded in future | Creates new codes only | Creates 0 for already-existing |

The check at `toCreate.length === 0` means the second call doesn't even reach `createMany` — zero DB writes.

---

## 8. What Initialization Does NOT Create

| Entity | Created by `initializeForTenant()`? |
|--------|-------------------------------------|
| `AccountingAccount` | YES — 17 rows per tenant |
| `JournalEntry` | **NO** |
| `JournalLine` | **NO** |
| `Sale` | **NO** |
| `SalePayment` | **NO** |
| `StockMovement` / stock records | **NO** |
| `CashDrawerTransaction` | **NO** |
| Any schema migration | **NO** |

The method calls only `tenant.findUnique`, `accountingAccount.findMany`, and `accountingAccount.createMany`. Nothing else.

---

## 9. No Migration Required

The `AccountingAccount` table was created by migration `20260817025923_add_accounting_core`, already applied to production on 2026-08-17. No further migration is needed for initialization.

---

## 10. Rollback / Recovery Strategy

### If initialization needs to be undone

Since `JournalEntry` = 0 and `JournalLine` = 0 (confirmed in production):

```sql
-- Safe to run ONLY when JournalLine count = 0 for this tenant
DELETE FROM "AccountingAccount"
WHERE "tenantId" = '<tenant_id>'
  AND "isSystem" = true;
```

Custom accounts (if any were created after init) would survive (they have `isSystem = false`). Only the 17 system accounts are removed.

After deletion, `initializeForTenant()` can be called again cleanly (idempotent from scratch).

### If initialization partially completed (crash mid-createMany)

- `createMany` with `skipDuplicates: true` is atomic at PostgreSQL level — it either commits all non-conflicting rows or nothing
- A re-run of `initializeForTenant()` will create the remaining missing accounts
- No orphaned or half-state records possible

---

## 11. Pilot Tenant Analysis

Current production state (2026-08-18):

| tenant_id | shop_name | plan | branches | sales | acct_accounts |
|-----------|-----------|------|----------|-------|---------------|
| cmsc05do8001u7i29q3p5x6zp | ริวคอม เซอร์วิซ | PRIVATE | 1 | **72** | 0 |
| cmqgw3ysh0003f963vgqh32j2 | ร้านชาริฟพีซี@ออล์ | PRIVATE | 2 | 14 | 0 |
| cmqm68640000kos0q0wos3zzv | ร้านชาริฟพีซี&ออล์ | BUSINESS | 1 | 5 | 0 |
| cmqjn635f0003twxdzufhno05 | It shop | TRIAL | 1 | 2 | 0 |
| cmrr3tpal00246zh9g5vedoaw | Jk | TRIAL | 1 | 0 | 0 |
| cmqhhyx57002seml4zjqk4t9u | ทดลองร้านที่ 2 | BUSINESS | 0 | 0 | 0 |
| cmqhhn73r001ieml4jy6c5u8e | Toymobile | BUSINESS | 2 | 0 | 0 |
| cmqhhqsq50021eml4edc5gwx2 | Farihan mobile | BUSINESS | 0 | 0 | 0 |
| cldefaulttenant0000000001 | FixITPro Shop | BUSINESS | 5 | 0 | 0 |

All 9 tenants have `AccountingAccount = 0` — none are initialized.

### Pilot recommendation

**Primary candidate:** `cmsc05do8001u7i29q3p5x6zp` (ริวคอม เซอร์วิซ)
- PRIVATE plan (highest tier — committed customer)
- 72 sales — most active tenant, will generate journal entries quickly to validate the system
- 1 branch — simple multi-branch situation; no branch routing complexity

**Secondary candidate:** `cmqm68640000kos0q0wos3zzv` (ร้านชาริฟพีซี&ออล์)
- BUSINESS plan
- 5 sales — lower volume, safer for first test
- 1 branch — simple

**Do NOT pilot:** TRIAL tenants (`It shop`, `Jk`) — they may not renew, and having accounting journals for a churned tenant creates orphaned data with no value.

**Owner must confirm the choice.** Tenant ID must be provided to the initialization call. The system will initialize the chart of accounts only — it will NOT create any journal entries until the accounting flag is activated AND new sales are processed.

---

## 12. Test Results

### Existing tests (unchanged)

| Test | Scenario | Result |
|------|----------|--------|
| 1 | New tenant → creates 17 accounts | PASS |
| 1b | createMany data shape (codes, tenantId, isSystem=true) | PASS |
| 2 | All existing → created=0, no createMany call | PASS |
| 3 | Call twice → idempotent | PASS |
| 4 | Race condition → skipDuplicates absorbs conflict | PASS |
| 5 | All rows stamped with target tenantId, not other | PASS |
| 6 | Unknown tenant → NotFoundException | PASS |
| 7 | Deactivate blocked when journal lines reference account | PASS |
| 7b | Deactivate succeeds when no journal references | PASS |
| 8 | createCustom rejects duplicate code → ConflictException | PASS |
| 8b | createCustom succeeds for unique code | PASS |
| 9 | dryRun returns correct missing/existing counts, no writes | PASS |
| 10 | Cross-tenant update → ForbiddenException | PASS |
| 11 | resolveByCode: inactive account → ConflictException | PASS |
| 11b | resolveByCode: missing code → NotFoundException | PASS |
| 12 | activate restores isActive=true | PASS |

### New test added this phase

| Test | Scenario | Result |
|------|----------|--------|
| 13 | Template contains all 5 codes required by SalesAccountingAdapter | PASS |

### Full suite

```
Test Suites: 28 passed, 28 total
Tests:       353 passed, 353 total  (+1 from Phase 4B.3A)
Snapshots:   0 total
```

---

## 13. Summary — Audit Findings

| Property | Finding | Risk |
|----------|---------|------|
| Idempotent | YES — second call is zero-write | None |
| Tenant isolated | YES — composite key + explicit tenantId stamp | None |
| Branch safe | YES — COA is tenant-level, not branch-level | None |
| Race safe | YES — `createMany skipDuplicates` absorbs concurrent init | None |
| SalesAccountingAdapter codes present | YES — all 5 in template (now test-verified) | None |
| Unique per tenant | YES — DB `@@unique([code, tenantId])` enforces | None |
| Inactive accounts rejected | YES — at resolveByCode and JournalService level | None |
| Cross-tenant resolution | IMPOSSIBLE — composite key lookup | None |
| No JournalEntry/JournalLine created | CONFIRMED — only accountingAccount.createMany | None |
| No migration required | CONFIRMED — table exists since 2026-08-17 | None |
| Rollback strategy | Clean DELETE by tenantId + isSystem (when JournalLine=0) | None |

**All checks PASS. The initialization system is safe to run on the pilot tenant.**

---

## STOPPED

No production initialization performed.

Awaiting owner approval to:
1. Select pilot tenant from the list above
2. Activate accounting env vars in production
3. Call `POST /api/v1/accounting/accounts/initialize` for the chosen tenant
4. Proceed to Phase 4B.3B (activation + live monitoring)
