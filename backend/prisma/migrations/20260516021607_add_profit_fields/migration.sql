-- AlterTable
ALTER TABLE "Repair" ADD COLUMN     "actualLaborCost" DECIMAL(10,2);

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN     "costPrice" DECIMAL(10,2) NOT NULL DEFAULT 0;
