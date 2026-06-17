-- P0 Multi-Tenant Fix: Add tenantId to core models so every query can be scoped per tenant.
-- All columns are nullable to avoid breaking existing rows during deploy;
-- a follow-up backfill script should set tenantId from the related User records.

-- Branch
ALTER TABLE "Branch" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Branch_tenantId_idx" ON "Branch"("tenantId");

-- Category: drop global slug unique, replace with per-tenant composite unique
ALTER TABLE "Category" DROP CONSTRAINT IF EXISTS "Category_slug_key";
ALTER TABLE "Category" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Category_tenantId_slug_key" ON "Category"("tenantId", "slug");
CREATE INDEX "Category_tenantId_idx" ON "Category"("tenantId");

-- Product: drop global sku unique, replace with per-tenant composite unique
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_sku_key";
ALTER TABLE "Product" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Product_tenantId_sku_key" ON "Product"("tenantId", "sku");
CREATE INDEX "Product_tenantId_idx" ON "Product"("tenantId");

-- Customer: drop global phone unique, replace with per-tenant composite unique
ALTER TABLE "Customer" DROP CONSTRAINT IF EXISTS "Customer_phone_key";
ALTER TABLE "Customer" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Customer_tenantId_phone_key" ON "Customer"("tenantId", "phone");
CREATE INDEX "Customer_tenantId_idx" ON "Customer"("tenantId");

-- Supplier
ALTER TABLE "Supplier" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Supplier_tenantId_idx" ON "Supplier"("tenantId");
