-- Optional quick money in/out and one-step paid repairs. Additive only.
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "quickEntry" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "partsPending" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "quickCashEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShiftCashMovement" ADD COLUMN IF NOT EXISTS "category" TEXT;
