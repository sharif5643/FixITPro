-- Scope carrier wallets, wallet movements and package sales per tenant.
-- Before this migration there was a single global wallet per carrier shared by all tenants.
--
-- Data safety: this migration only ADDS a nullable column and fills it in.
-- No row is deleted and no balance or amount is changed.
-- Every statement is idempotent, so a partially applied run can simply be re-run.

ALTER TABLE "CarrierWallet"         ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "CarrierWalletMovement" ADD COLUMN IF NOT EXISTS "tenantId" TEXT;
ALTER TABLE "PackageSale"           ADD COLUMN IF NOT EXISTS "tenantId" TEXT;

-- Backfill sales and movements from the tenant of the user who created them
UPDATE "PackageSale" ps
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE u."id" = ps."createdById"
  AND ps."tenantId" IS NULL;

UPDATE "CarrierWalletMovement" m
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE u."id" = m."createdById"
  AND m."tenantId" IS NULL;

-- Hand each legacy global wallet (and its balance) to the tenant that used it most recently.
-- Other tenants get a fresh zero-balance wallet on first use.
UPDATE "CarrierWallet" w
SET "tenantId" = latest."tenantId"
FROM (
  SELECT DISTINCT ON ("walletId") "walletId", "tenantId"
  FROM "CarrierWalletMovement"
  WHERE "tenantId" IS NOT NULL
  ORDER BY "walletId", "createdAt" DESC
) latest
WHERE latest."walletId" = w."id"
  AND w."tenantId" IS NULL;

DROP INDEX IF EXISTS "CarrierWallet_carrier_key";
CREATE UNIQUE INDEX IF NOT EXISTS "CarrierWallet_tenantId_carrier_key" ON "CarrierWallet"("tenantId", "carrier");

CREATE INDEX IF NOT EXISTS "CarrierWalletMovement_tenantId_createdAt_idx" ON "CarrierWalletMovement"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "CarrierWalletMovement_shiftId_idx"            ON "CarrierWalletMovement"("shiftId");
CREATE INDEX IF NOT EXISTS "PackageSale_tenantId_createdAt_idx"           ON "PackageSale"("tenantId", "createdAt");
