-- Backfill tenantId for all existing records using the single tenant in the system.
-- Safe to run when there is exactly one tenant (single-shop deployment).
-- If tenantId is already set on a record it is left unchanged.

DO $$
DECLARE
  single_tenant_id TEXT;
BEGIN
  SELECT id INTO single_tenant_id FROM "Tenant" LIMIT 1;

  IF single_tenant_id IS NOT NULL THEN
    UPDATE "Branch"   SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
    UPDATE "Category" SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
    UPDATE "Product"  SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
    UPDATE "Customer" SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
    UPDATE "Supplier" SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
  END IF;
END $$;
