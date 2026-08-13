-- Phase 13: TenantAddon — add-on purchases (storage 99฿/10GB, branch 500฿/branch).
CREATE TABLE IF NOT EXISTS "TenantAddon" (
  "id"          TEXT         NOT NULL DEFAULT gen_random_uuid(),
  "type"        TEXT         NOT NULL,
  "quantity"    INTEGER      NOT NULL,
  "priceThb"    DECIMAL(10,2) NOT NULL,
  "note"        TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"    TEXT         NOT NULL,
  "grantedById" TEXT,

  CONSTRAINT "TenantAddon_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TenantAddon_tenantId_idx" ON "TenantAddon"("tenantId");

ALTER TABLE "TenantAddon"
  ADD CONSTRAINT "TenantAddon_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
