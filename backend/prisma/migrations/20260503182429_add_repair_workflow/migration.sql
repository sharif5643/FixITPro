-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RepairStatus" ADD VALUE 'WAITING_APPROVAL';
ALTER TYPE "RepairStatus" ADD VALUE 'APPROVED';

-- AlterTable
ALTER TABLE "Repair" ADD COLUMN     "approvalNote" TEXT,
ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedLaborCost" DECIMAL(10,2),
ADD COLUMN     "estimatedPartsCost" DECIMAL(10,2),
ADD COLUMN     "estimatedTotal" DECIMAL(10,2);
