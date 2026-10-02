-- Category types per tenant. Existing types stay shared (tenantId NULL) and remain visible to
-- every shop; types a shop creates from now on belong to that shop only.
-- Additive and idempotent: no row is deleted or changed.

ALTER TABLE "CategoryType" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

DROP INDEX IF EXISTS "CategoryType_slug_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CategoryType_tenantId_slug_key" ON "CategoryType"("tenantId", "slug");
CREATE INDEX IF NOT EXISTS "CategoryType_tenantId_idx" ON "CategoryType"("tenantId");
