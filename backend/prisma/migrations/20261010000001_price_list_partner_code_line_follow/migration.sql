-- Additive only: one nullable column, two new tables. No existing row is changed.

-- The code another shop types to connect as a repair partner (filled in the first time it is shown)
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "partnerCode" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Tenant_partnerCode_key" ON "Tenant"("partnerCode");

-- Repair price list: brand + model + job → price
CREATE TABLE IF NOT EXISTS "RepairPrice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "costPrice" DECIMAL(10,2),
    "warrantyDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RepairPrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RepairPrice_tenantId_brand_model_service_key" ON "RepairPrice"("tenantId", "brand", "model", "service");
CREATE INDEX IF NOT EXISTS "RepairPrice_tenantId_brand_model_idx" ON "RepairPrice"("tenantId", "brand", "model");

-- Customers following a repair on FixITPro's LINE account
CREATE TABLE IF NOT EXISTS "RepairLineFollow" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "lineUserId" TEXT NOT NULL,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RepairLineFollow_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "RepairLineFollow_repairId_lineUserId_key" ON "RepairLineFollow"("repairId", "lineUserId");
CREATE INDEX IF NOT EXISTS "RepairLineFollow_lineUserId_idx" ON "RepairLineFollow"("lineUserId");
ALTER TABLE "RepairLineFollow" ADD CONSTRAINT "RepairLineFollow_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
