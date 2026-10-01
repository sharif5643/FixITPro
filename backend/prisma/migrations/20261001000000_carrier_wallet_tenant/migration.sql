-- Scope carrier wallets, wallet movements and package sales per tenant.
-- Before this migration there was a single global wallet per carrier shared by all tenants.

ALTER TABLE "CarrierWallet"         ADD COLUMN "tenantId" TEXT;
ALTER TABLE "CarrierWalletMovement" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PackageSale"           ADD COLUMN "tenantId" TEXT;

-- Backfill sales and movements from the tenant of the user who created them
UPDATE "PackageSale" ps
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE u."id" = ps."createdById";

UPDATE "CarrierWalletMovement" m
SET "tenantId" = u."tenantId"
FROM "User" u
WHERE u."id" = m."createdById";

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
WHERE latest."walletId" = w."id";

DROP INDEX "CarrierWallet_carrier_key";
CREATE UNIQUE INDEX "CarrierWallet_tenantId_carrier_key" ON "CarrierWallet"("tenantId", "carrier");

CREATE INDEX "CarrierWalletMovement_tenantId_createdAt_idx" ON "CarrierWalletMovement"("tenantId", "createdAt");
CREATE INDEX "CarrierWalletMovement_shiftId_idx"            ON "CarrierWalletMovement"("shiftId");
CREATE INDEX "PackageSale_tenantId_createdAt_idx"           ON "PackageSale"("tenantId", "createdAt");
