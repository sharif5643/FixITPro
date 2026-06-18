-- Migration: add tenantId to ExpenseCategory
-- null = global system default (backward compat); non-null = tenant-private category

-- 1. Drop existing unique index on code (single column)
DROP INDEX IF EXISTS "ExpenseCategory_code_key";

-- 2. Add tenantId column (nullable for backward compat)
ALTER TABLE "ExpenseCategory" ADD COLUMN "tenantId" TEXT;

-- 3. Add foreign key constraint
ALTER TABLE "ExpenseCategory"
  ADD CONSTRAINT "ExpenseCategory_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Create composite unique index (code + tenantId)
--    Two rows with same code but different tenantId (or one NULL) are distinct
CREATE UNIQUE INDEX "ExpenseCategory_code_tenantId_key"
  ON "ExpenseCategory"("code", "tenantId");

-- 5. Index for fast per-tenant lookups
CREATE INDEX "ExpenseCategory_tenantId_idx" ON "ExpenseCategory"("tenantId");
