-- Products get a brand and a model to group, search and filter by. Additive only:
-- two nullable columns and an index; existing products keep empty values.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "brand" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "model" TEXT;
CREATE INDEX IF NOT EXISTS "Product_tenantId_brand_idx" ON "Product"("tenantId", "brand");
