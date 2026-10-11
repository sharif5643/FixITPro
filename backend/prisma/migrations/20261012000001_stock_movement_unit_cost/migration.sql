-- Price paid per unit on stock that came in, so cost changes can be traced. Additive only.
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "unitCost" DECIMAL(10,2);
