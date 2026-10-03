-- Commission plans: per-staff rates, per-repair-type amounts and sale commission.
-- Additive only: new columns have defaults that keep today's behaviour, and nothing is removed.
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "techCommissionTypeRates" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "saleCommissionType" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "saleCommissionValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "saleCommissionScope" TEXT NOT NULL DEFAULT 'PHONE';

ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "sellerId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "Sale_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "Sale_sellerId_createdAt_idx" ON "Sale"("sellerId", "createdAt");

CREATE TABLE IF NOT EXISTS "StaffCommission" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "repairType" TEXT,
  "repairValue" DECIMAL(10,2),
  "saleType" TEXT,
  "saleValue" DECIMAL(10,2),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StaffCommission_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffCommission_userId_key" ON "StaffCommission"("userId");
CREATE INDEX IF NOT EXISTS "StaffCommission_tenantId_idx" ON "StaffCommission"("tenantId");
DO $$ BEGIN
  ALTER TABLE "StaffCommission" ADD CONSTRAINT "StaffCommission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
