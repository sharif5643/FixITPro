-- Add productName snapshot and chargeToCustomer billing flag to RepairPart
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "productName" TEXT;
ALTER TABLE "RepairPart" ADD COLUMN IF NOT EXISTS "chargeToCustomer" BOOLEAN NOT NULL DEFAULT false;

-- Backfill productName from product.name for existing rows
UPDATE "RepairPart" rp
SET "productName" = p.name
FROM "Product" p
WHERE rp."productId" = p.id AND rp."productName" IS NULL;

-- sellPrice on all existing rows should be 0 (not product.price)
-- because old rows were created before the chargeToCustomer concept existed
-- and were never explicitly billed to the customer as a separate line item
UPDATE "RepairPart" SET "sellPrice" = 0 WHERE "chargeToCustomer" = false AND "sellPrice" IS NOT NULL;
