-- SIM / package sales on credit ("ค้างจ่าย"). Additive only: existing sales get 0 owed.
ALTER TABLE "PackageSale" ADD COLUMN IF NOT EXISTS "creditAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "PackageSale" ADD COLUMN IF NOT EXISTS "amountDue"    DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "PackageSale" ADD COLUMN IF NOT EXISTS "debtorName"   TEXT;
ALTER TABLE "PackageSale" ADD COLUMN IF NOT EXISTS "debtorPhone"  TEXT;
ALTER TABLE "PackageSale" ADD COLUMN IF NOT EXISTS "settledAt"    TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "PackageSale_tenantId_amountDue_idx" ON "PackageSale"("tenantId", "amountDue");

-- One unpaid sale per customer per shop: a second credit sale for the same phone fails here
-- even when two cashiers press the button at the same moment.
CREATE UNIQUE INDEX IF NOT EXISTS "PackageSale_one_open_debt_per_phone"
  ON "PackageSale"("tenantId", "debtorPhone") WHERE "amountDue" > 0;

CREATE TABLE IF NOT EXISTS "PackageSaleDebtPayment" (
  "id"            TEXT NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "shiftId"       TEXT,
  "cashierName"   TEXT NOT NULL,
  "createdById"   TEXT NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "tenantId"      TEXT,
  "packageSaleId" TEXT NOT NULL,
  CONSTRAINT "PackageSaleDebtPayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PackageSaleDebtPayment_receiptNumber_key" ON "PackageSaleDebtPayment"("receiptNumber");
CREATE INDEX IF NOT EXISTS "PackageSaleDebtPayment_packageSaleId_idx" ON "PackageSaleDebtPayment"("packageSaleId");
CREATE INDEX IF NOT EXISTS "PackageSaleDebtPayment_shiftId_idx" ON "PackageSaleDebtPayment"("shiftId");
CREATE INDEX IF NOT EXISTS "PackageSaleDebtPayment_tenantId_createdAt_idx" ON "PackageSaleDebtPayment"("tenantId", "createdAt");
DO $$ BEGIN
  ALTER TABLE "PackageSaleDebtPayment" ADD CONSTRAINT "PackageSaleDebtPayment_packageSaleId_fkey"
    FOREIGN KEY ("packageSaleId") REFERENCES "PackageSale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
