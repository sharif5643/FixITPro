-- CreateEnum
CREATE TYPE "Carrier" AS ENUM ('AIS', 'TRUE', 'DTAC', 'NT');

-- CreateEnum
CREATE TYPE "WalletMovementType" AS ENUM ('OPENING', 'TOPUP', 'DEDUCTION', 'ADJUSTMENT');

-- AlterTable: Shift carrier opening balance snapshots
ALTER TABLE "Shift"
  ADD COLUMN "aisOpeningBalance"  DECIMAL(12,2),
  ADD COLUMN "trueOpeningBalance" DECIMAL(12,2),
  ADD COLUMN "dtacOpeningBalance" DECIMAL(12,2),
  ADD COLUMN "ntOpeningBalance"   DECIMAL(12,2);

-- CreateTable: CarrierWallet
CREATE TABLE "CarrierWallet" (
  "id"        TEXT          NOT NULL,
  "carrier"   "Carrier"     NOT NULL,
  "balance"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "CarrierWallet_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CarrierWallet_carrier_key" ON "CarrierWallet"("carrier");

-- CreateTable: CarrierWalletMovement
CREATE TABLE "CarrierWalletMovement" (
  "id"            TEXT                 NOT NULL,
  "carrier"       "Carrier"            NOT NULL,
  "type"          "WalletMovementType" NOT NULL,
  "amount"        DECIMAL(12,2)        NOT NULL,
  "balanceBefore" DECIMAL(12,2)        NOT NULL,
  "balanceAfter"  DECIMAL(12,2)        NOT NULL,
  "note"          TEXT,
  "createdAt"     TIMESTAMP(3)         NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "walletId"      TEXT                 NOT NULL,
  "shiftId"       TEXT,
  "createdById"   TEXT,
  CONSTRAINT "CarrierWalletMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CarrierWalletMovement_carrier_createdAt_idx" ON "CarrierWalletMovement"("carrier", "createdAt");
CREATE INDEX "CarrierWalletMovement_type_createdAt_idx"    ON "CarrierWalletMovement"("type", "createdAt");
ALTER TABLE "CarrierWalletMovement"
  ADD CONSTRAINT "CarrierWalletMovement_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "CarrierWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: PackageSale
CREATE TABLE "PackageSale" (
  "id"              TEXT            NOT NULL,
  "receiptNumber"   TEXT            NOT NULL,
  "carrier"         "Carrier"       NOT NULL,
  "packageAmount"   DECIMAL(10,2)   NOT NULL,
  "walletDeduction" DECIMAL(10,2)   NOT NULL,
  "profit"          DECIMAL(10,2)   NOT NULL,
  "phoneNumber"     TEXT,
  "note"            TEXT,
  "paymentMethod"   "PaymentMethod" NOT NULL,
  "amountPaid"      DECIMAL(10,2)   NOT NULL,
  "change"          DECIMAL(10,2)   NOT NULL,
  "cashierName"     TEXT            NOT NULL,
  "createdAt"       TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "shiftId"         TEXT,
  "createdById"     TEXT            NOT NULL,
  CONSTRAINT "PackageSale_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PackageSale_receiptNumber_key" ON "PackageSale"("receiptNumber");
CREATE INDEX "PackageSale_carrier_createdAt_idx" ON "PackageSale"("carrier", "createdAt");
CREATE INDEX "PackageSale_createdAt_idx"          ON "PackageSale"("createdAt");
CREATE INDEX "PackageSale_shiftId_idx"            ON "PackageSale"("shiftId");
ALTER TABLE "PackageSale"
  ADD CONSTRAINT "PackageSale_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed initial CarrierWallet rows (zero balance)
INSERT INTO "CarrierWallet" ("id", "carrier", "balance", "updatedAt")
VALUES
  (gen_random_uuid()::text, 'AIS',  0, NOW()),
  (gen_random_uuid()::text, 'TRUE', 0, NOW()),
  (gen_random_uuid()::text, 'DTAC', 0, NOW()),
  (gen_random_uuid()::text, 'NT',   0, NOW())
ON CONFLICT ("carrier") DO NOTHING;
