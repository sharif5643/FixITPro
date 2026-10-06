-- Formal A4 documents for agencies (quotation / invoice / receipt). Adds nullable columns and
-- two new tables only; no existing row or column changes.
ALTER TABLE "Customer"     ADD COLUMN IF NOT EXISTS "taxId"     TEXT;
ALTER TABLE "Customer"     ADD COLUMN IF NOT EXISTS "taxBranch" TEXT;
ALTER TABLE "Repair"       ADD COLUMN IF NOT EXISTS "assetTag"  TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "legalName" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "taxBranch" TEXT;

CREATE TABLE IF NOT EXISTS "FormalDocument" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "branchId"    TEXT,
  "type"        TEXT NOT NULL,
  "number"      TEXT NOT NULL,
  "docDate"     TIMESTAMP(3) NOT NULL,
  "hideDate"    BOOLEAN NOT NULL DEFAULT false,
  "customerId"  TEXT,
  "repairIds"   TEXT[] DEFAULT ARRAY[]::TEXT[],
  "total"       DECIMAL(12,2) NOT NULL,
  "vatPercent"  DECIMAL(5,2) NOT NULL DEFAULT 0,
  "content"     JSONB NOT NULL,
  "createdById" TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormalDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FormalDocument_tenantId_type_number_key" ON "FormalDocument"("tenantId", "type", "number");
CREATE INDEX IF NOT EXISTS "FormalDocument_tenantId_createdAt_idx" ON "FormalDocument"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "FormalDocument_customerId_idx" ON "FormalDocument"("customerId");

CREATE TABLE IF NOT EXISTS "FormalDocumentCounter" (
  "tenantId" TEXT NOT NULL,
  "type"     TEXT NOT NULL,
  "year"     INTEGER NOT NULL,
  "last"     INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "FormalDocumentCounter_pkey" PRIMARY KEY ("tenantId", "type", "year")
);
