-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockTransferStatus" ADD VALUE 'APPROVED';
ALTER TYPE "StockTransferStatus" ADD VALUE 'REJECTED';
ALTER TYPE "StockTransferStatus" ADD VALUE 'IN_TRANSIT';
ALTER TYPE "StockTransferStatus" ADD VALUE 'RECEIVED';

-- DropIndex
DROP INDEX "Shift_branchId_idx";

-- DropIndex
DROP INDEX "User_branchId_idx";

-- AlterTable
ALTER TABLE "StockTransfer" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" TEXT,
ADD COLUMN     "approvedByName" TEXT,
ADD COLUMN     "inTransitAt" TIMESTAMP(3),
ADD COLUMN     "inTransitById" TEXT,
ADD COLUMN     "inTransitByName" TEXT,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "receivedById" TEXT,
ADD COLUMN     "receivedByName" TEXT,
ADD COLUMN     "rejectReason" TEXT,
ADD COLUMN     "rejectedAt" TIMESTAMP(3),
ADD COLUMN     "rejectedById" TEXT,
ADD COLUMN     "rejectedByName" TEXT;
