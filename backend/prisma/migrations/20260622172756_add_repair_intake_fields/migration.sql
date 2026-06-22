-- AlterTable
ALTER TABLE "Repair" ADD COLUMN     "deviceConditions" JSONB,
ADD COLUMN     "deviceType" TEXT,
ADD COLUMN     "discount" DECIMAL(10,2),
ADD COLUMN     "issueTags" JSONB;

-- AlterTable
ALTER TABLE "RepairImage" ADD COLUMN     "category" TEXT;
