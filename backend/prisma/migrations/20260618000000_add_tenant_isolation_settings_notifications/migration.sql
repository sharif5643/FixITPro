-- Add tenantId to ShopSettings (one row per tenant, replacing global id=1 row)
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_tenantId_key" UNIQUE ("tenantId");
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add tenantId to Notification (per-tenant isolation)
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Notification_tenantId_idx" ON "Notification"("tenantId");

-- Backfill ShopSettings: assign the existing row(s) to the first (and only) tenant.
-- In a single-shop deployment this is safe; if running multi-tenant already,
-- each tenant will auto-create their own row on first access via the upsert.
DO $$
DECLARE single_tenant_id TEXT;
BEGIN
  SELECT id INTO single_tenant_id FROM "Tenant" LIMIT 1;
  IF single_tenant_id IS NOT NULL THEN
    UPDATE "ShopSettings" SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
  END IF;
END $$;

-- Backfill Notification: derive tenantId from the linked branch, fall back to single tenant.
UPDATE "Notification" n
SET    "tenantId" = b."tenantId"
FROM   "Branch" b
WHERE  n."branchId" = b.id
  AND  n."tenantId" IS NULL
  AND  b."tenantId" IS NOT NULL;

-- Any remaining notifications without a branch link get the single tenant.
DO $$
DECLARE single_tenant_id TEXT;
BEGIN
  SELECT id INTO single_tenant_id FROM "Tenant" LIMIT 1;
  IF single_tenant_id IS NOT NULL THEN
    UPDATE "Notification" SET "tenantId" = single_tenant_id WHERE "tenantId" IS NULL;
  END IF;
END $$;
