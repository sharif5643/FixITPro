# Phase 2 — Accounting Database Core Migration

> **Status:** COMPLETE (test DB applied; production pending approval)  
> **Date:** 2026-08-17  
> **Migration ID:** `20260817025923_add_accounting_core`  
> **Migration number:** #69 of 69  
> **Test DB:** `fixitpro_test` — applied and verified  
> **Production DB:** NOT migrated (awaiting separate approval)

---

## 1. Tables Created

### 1.1 `AccountingAccount`
Chart of Accounts — one row per nominal account per tenant.
System accounts have `tenantId = NULL` (shared globally).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | TEXT (cuid) | NO | — |
| code | TEXT | NO | — |
| name | TEXT | NO | — |
| nameTh | TEXT | NO | — |
| type | AccountType enum | NO | — |
| subType | TEXT | YES | NULL |
| isSystem | BOOLEAN | NO | false |
| isActive | BOOLEAN | NO | true |
| sortOrder | INTEGER | NO | 0 |
| tenantId | TEXT | YES | NULL |
| createdAt | TIMESTAMP | NO | CURRENT_TIMESTAMP |

### 1.2 `JournalEntry`
Journal entry header — one row per accounting event.
Double-entry balance enforced at service layer (Phase 4+).

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | TEXT (cuid) | NO | — |
| entryNumber | TEXT | NO | — |
| entryDate | TIMESTAMP | NO | — |
| description | TEXT | NO | — |
| sourceType | TEXT | YES | NULL |
| sourceId | TEXT | YES | NULL |
| sourceRef | TEXT | YES | NULL |
| isVoided | BOOLEAN | NO | false |
| voidedAt | TIMESTAMP | YES | NULL |
| voidedById | TEXT | YES | NULL |
| voidReason | TEXT | YES | NULL |
| isBackfill | BOOLEAN | NO | false |
| postedById | TEXT | YES | NULL |
| postedAt | TIMESTAMP | YES | NULL |
| tenantId | TEXT | YES | NULL |
| branchId | TEXT | YES | NULL |
| createdAt | TIMESTAMP | NO | CURRENT_TIMESTAMP |

### 1.3 `JournalLine`
Individual debit or credit leg attached to an account.

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | TEXT (cuid) | NO | — |
| debit | DECIMAL(12,2) | NO | 0 |
| credit | DECIMAL(12,2) | NO | 0 |
| paymentMethod | TEXT | YES | NULL |
| note | TEXT | YES | NULL |
| sortOrder | INTEGER | NO | 0 |
| entryId | TEXT | NO | — |
| accountId | TEXT | NO | — |

---

## 2. Enum Created

```sql
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
```

---

## 3. Indexes Created (14 total)

| Table | Index | Type |
|-------|-------|------|
| AccountingAccount | `AccountingAccount_pkey` | PRIMARY (id) |
| AccountingAccount | `AccountingAccount_code_tenantId_key` | UNIQUE (code, tenantId) |
| AccountingAccount | `AccountingAccount_tenantId_idx` | INDEX (tenantId) |
| AccountingAccount | `AccountingAccount_type_idx` | INDEX (type) |
| JournalEntry | `JournalEntry_pkey` | PRIMARY (id) |
| JournalEntry | `JournalEntry_entryNumber_key` | UNIQUE (entryNumber) |
| JournalEntry | `JournalEntry_tenantId_entryDate_idx` | INDEX (tenantId, entryDate) |
| JournalEntry | `JournalEntry_branchId_entryDate_idx` | INDEX (branchId, entryDate) |
| JournalEntry | `JournalEntry_sourceType_sourceId_idx` | INDEX (sourceType, sourceId) |
| JournalEntry | `JournalEntry_entryDate_idx` | INDEX (entryDate) |
| JournalEntry | `JournalEntry_isVoided_idx` | INDEX (isVoided) |
| JournalLine | `JournalLine_pkey` | PRIMARY (id) |
| JournalLine | `JournalLine_entryId_idx` | INDEX (entryId) |
| JournalLine | `JournalLine_accountId_idx` | INDEX (accountId) |

---

## 4. Foreign Keys Created

| Constraint | From | To | On Delete |
|-----------|------|----|-----------|
| `JournalLine_entryId_fkey` | JournalLine.entryId | JournalEntry.id | CASCADE |
| `JournalLine_accountId_fkey` | JournalLine.accountId | AccountingAccount.id | RESTRICT |

Note: `JournalEntry.tenantId`, `JournalEntry.branchId`, `JournalEntry.postedById`, 
`JournalEntry.voidedById`, and `AccountingAccount.tenantId` are plain TEXT fields — no FK
constraints to Tenant/Branch/User tables. This avoids adding back-relations to existing models
and follows the same pattern as `AuditLog` and `LoyaltyTransaction` in this codebase.

---

## 5. Migration SQL (full)

```sql
-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateTable
CREATE TABLE "AccountingAccount" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameTh" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "subType" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL,
    "entryNumber" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "sourceRef" TEXT,
    "isVoided" BOOLEAN NOT NULL DEFAULT false,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "isBackfill" BOOLEAN NOT NULL DEFAULT false,
    "postedById" TEXT,
    "postedAt" TIMESTAMP(3),
    "tenantId" TEXT,
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" TEXT NOT NULL,
    "debit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "note" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "entryId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountingAccount_tenantId_idx" ON "AccountingAccount"("tenantId");
CREATE INDEX "AccountingAccount_type_idx" ON "AccountingAccount"("type");
CREATE UNIQUE INDEX "AccountingAccount_code_tenantId_key" ON "AccountingAccount"("code", "tenantId");
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");
CREATE INDEX "JournalEntry_tenantId_entryDate_idx" ON "JournalEntry"("tenantId", "entryDate");
CREATE INDEX "JournalEntry_branchId_entryDate_idx" ON "JournalEntry"("branchId", "entryDate");
CREATE INDEX "JournalEntry_sourceType_sourceId_idx" ON "JournalEntry"("sourceType", "sourceId");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE INDEX "JournalEntry_isVoided_idx" ON "JournalEntry"("isVoided");
CREATE INDEX "JournalLine_entryId_idx" ON "JournalLine"("entryId");
CREATE INDEX "JournalLine_accountId_idx" ON "JournalLine"("accountId");

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "AccountingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

---

## 6. SQL Safety Audit

| Check | Result |
|-------|--------|
| DROP TABLE | ✅ None |
| TRUNCATE | ✅ None |
| DELETE | ✅ None |
| ALTER existing business table | ✅ None |
| UPDATE existing data | ✅ None |
| Rename existing column | ✅ None |
| Rename existing table | ✅ None |
| Change existing PK/FK | ✅ None |
| ALTER TABLE on JournalLine | Only ADD CONSTRAINT (new table) |

> **Note on rejected drift:** The raw generated migration included two statements touching
> existing tables (`ALTER TABLE "SalePayment"` and `ALTER TABLE "TenantAddon"`). These
> were caused by pre-existing schema drift in the test DB — NOT caused by Phase 2 changes.
> They were removed from the migration file. Drift investigation is a separate task.
> The two statements were:
> - `SalePayment.paymentMethod` type mismatch (TEXT vs PaymentMethod enum) — would have dropped column with data
> - `TenantAddon.id` DROP DEFAULT — minor but unauthorized scope

---

## 7. Test Results

```
Test Suites: 24 passed, 24 total
Tests:       229 passed, 229 total
Time:        28.325 s
```

All 229 existing unit tests pass. No regressions.

---

## 8. Existing Table Verification

**Before migration (test DB baseline):** 57 tables  
**After applying 10 pending dev migrations:** 62 tables (+5 new: DailyClose, LoyaltyTransaction, SalePayment, TenantAddon, UserPermission)  
**After Phase 2 migration:** 65 tables (+3 new: AccountingAccount, JournalEntry, JournalLine)

All 57 original business tables confirmed present and unchanged:

AppModule, AuditLog, Branch, BranchStock, CarrierWallet, CarrierWalletMovement, CashDrawer, CashDrawerParticipant, CashDrawerSession, CashDrawerTransaction, Category, CategoryType, Claim, ClaimStatusHistory, Customer, CustomerNote, Expense, ExpenseCategory, Notification, Package, PackageModule, PackageSale, Product, PurchaseOrder, PurchaseOrderItem, RefreshToken, ReminderSettings, ReminderSnooze, Repair, RepairAdditionalPayment, RepairImage, RepairMessage, RepairPart, RepairPaymentReversal, RepairQc, RepairReview, RolePermission, Sale, SaleItem, SaleRefund, SaleRefundItem, SerialNumber, Shift, ShopSettings, StockMovement, StockTransfer, Subscription, SubscriptionRenewal, Supplier, SupplierPayment, Tenant, TenantModule, TenantPayment, TenantRenewal, User, Warranty, _prisma_migrations

---

## 9. Tenant Isolation Verification

| Model | Tenant Isolation | Method |
|-------|-----------------|--------|
| AccountingAccount | tenantId TEXT (nullable) | System accounts: tenantId=NULL; Tenant accounts: tenantId=<id> |
| JournalEntry | tenantId + branchId TEXT | Queries filter by tenantId AND branchId |
| JournalLine | Via JournalEntry + AccountingAccount | No direct tenantId — access through parent join |

**No cross-tenant leakage path:** 
- All queries to `JournalEntry` must include `tenantId` filter
- `JournalLine` can only be accessed via `entryId` (FK to JournalEntry) — tenant check at entry level
- `AccountingAccount` unique index is per `[code, tenantId]` — system accounts (NULL tenantId) use application-level uniqueness (Phase 3)

---

## 10. Production Migration Procedure

**DO NOT EXECUTE until explicitly approved by owner.**

```
Step 1:  BACKUP
         └─ pg_dump fixitpro > fixitpro_backup_before_phase2_$(date +%Y%m%d).sql
         └─ Upload to S3 / Coolify backup
         └─ VERIFY backup is restorable on a test server

Step 2:  REVIEW SQL
         └─ Read migration.sql line by line (already done above)
         └─ Confirm: NO DROP, NO DELETE, NO TRUNCATE, NO ALTER existing table

Step 3:  STAGING TEST
         └─ Apply migration to fixitpro_test (already done ✅)
         └─ Run npm run test:ci (229/229 ✅)
         └─ Verify table counts (already done ✅)

Step 4:  MAINTENANCE WINDOW
         └─ Inform users (optional — migration is additive, no downtime expected)
         └─ New tables are empty, no locks on existing tables

Step 5:  MIGRATE
         └─ SSH to production server
         └─ cd /app/backend
         └─ npx prisma migrate deploy
         └─ Expected output: "Applying migration 20260817025923_add_accounting_core"

Step 6:  VERIFY
         └─ SELECT count(*) FROM "AccountingAccount";  -- should be 0
         └─ SELECT count(*) FROM "JournalEntry";       -- should be 0
         └─ SELECT count(*) FROM "JournalLine";        -- should be 0
         └─ Verify existing business tables row counts unchanged
         └─ Run health check endpoint

Step 7:  MONITOR
         └─ Watch application logs for 15 minutes
         └─ Check Coolify dashboard for error spikes
```

---

## 11. Rollback Procedure

**DO NOT EXECUTE unless directed by owner.**

Since all 3 tables start empty (Phase 4+ writes data), rollback is safe:

```sql
-- Rollback Phase 2 (drops only the 3 new tables and 1 new enum)
DROP TABLE IF EXISTS "JournalLine" CASCADE;
DROP TABLE IF EXISTS "JournalEntry" CASCADE;
DROP TABLE IF EXISTS "AccountingAccount" CASCADE;
DROP TYPE IF EXISTS "AccountType";

-- Remove from Prisma migration history
DELETE FROM "_prisma_migrations" WHERE migration_name = '20260817025923_add_accounting_core';
```

**Risk:** Zero data loss — tables are empty until Phase 3 seeds them.  
**Recovery time:** < 1 minute.

---

## 12. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration causes downtime | Very Low | Low | Tables are additive, no locks on existing tables |
| FK constraint prevents JournalLine insert | Low | Low | Only applies when Phase 4+ starts writing; not active in Phase 2 |
| TenantId drift (pre-existing) | Medium | Low | Separate investigation needed for SalePayment/TenantAddon drift |
| AccountingAccount unique constraint behavior with NULL | Low | Low | Documented; application layer enforces system account uniqueness |

---

## 13. Files Changed

| File | Type | Change |
|------|------|--------|
| `backend/prisma/schema.prisma` | Existing | Added `AccountType` enum, `AccountingAccount`, `JournalEntry`, `JournalLine` models |
| `backend/prisma/migrations/20260817025923_add_accounting_core/migration.sql` | NEW | Additive-only migration SQL |

**No other files changed.**  
**No service code changed.**  
**No AccountingService changed.**  
**No API contracts changed.**  
**No existing tables altered.**

---

## 14. Final Checklist

```
[✅] SQL reviewed line-by-line — NO DROP / DELETE / TRUNCATE / ALTER existing table
[✅] Migration applied to fixitpro_test successfully
[✅] Existing 57 baseline tables all present and unchanged
[✅] 3 new tables created with correct columns
[✅] All 14 indexes created and verified
[✅] Both FK constraints verified (JournalLine → JournalEntry, JournalLine → AccountingAccount)
[✅] AccountType enum created
[✅] npm test: 229/229 passing — zero regressions
[✅] Tenant isolation design verified
[✅] Rollback plan documented
[✅] Production migration procedure documented
[❌] Production migration NOT executed (awaiting approval)
[❌] Chart of Accounts NOT seeded (Phase 3)
[❌] AccountingService NOT modified (Phase 4)
```

---

## 15. Pre-existing Schema Drift Notice

During migration generation, Prisma detected 2 pre-existing drifts in the test DB that are
**unrelated to Phase 2** and were **excluded** from this migration:

1. **`SalePayment.paymentMethod`** — The column type in the DB differs from schema.prisma
   (TEXT vs PaymentMethod enum). The generated statement would have **dropped and recreated**
   the column, losing data. This needs separate investigation and a data-safe migration.

2. **`TenantAddon.id`** — DROP DEFAULT was generated, likely because the column was created
   with a default value that differs from what schema.prisma expects. Low risk but needs review.

**These drifts exist only in `fixitpro_test`** — the dev DB has the correct schema since all
68 migrations were applied in order. The test DB was behind by 10 migrations, and the
historical SQL in those migrations may have set types that differ from current schema.prisma.

**Action required (outside Phase 2):** Investigate whether dev DB also has these drifts by
running `prisma migrate dev --create-only` against dev. If drifts are confirmed, create a
targeted fix migration that's data-safe.

---

*Phase 2 completed 2026-08-17. Ready for Phase 3 approval.*
