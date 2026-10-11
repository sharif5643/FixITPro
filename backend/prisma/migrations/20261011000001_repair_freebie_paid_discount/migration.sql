-- Additive only: nullable / defaulted columns. No existing row is changed.

-- A part given free with the repair, and its normal price at the time (shown on the receipt)
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "isFreebie" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "freebieValue" DECIMAL(10,2);

-- Discount given when the customer paid, and who gave it
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "paidDiscount" DECIMAL(10,2);
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "paidDiscountById" TEXT;

-- The most a non-owner may take off at pickup (% of the price); null = no limit
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "staffDiscountLimitPercent" INTEGER;
