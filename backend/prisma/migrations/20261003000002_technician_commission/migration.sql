-- How the shop pays technicians per repair, used by the commission report only.
-- NONE (default) keeps everything as it is. Additive and idempotent.
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "techCommissionType" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "techCommissionValue" DECIMAL(10,2) NOT NULL DEFAULT 0;
