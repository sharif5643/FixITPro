-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RepairStatus" ADD VALUE 'QC_PENDING';
ALTER TYPE "RepairStatus" ADD VALUE 'READY_PICKUP';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "lineUserId" TEXT;

-- AlterTable
ALTER TABLE "ShopSettings" ADD COLUMN     "lineChannelAccessToken" TEXT,
ADD COLUMN     "lineNotifyEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RepairQc" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "touchScreen" BOOLEAN NOT NULL DEFAULT false,
    "speaker" BOOLEAN NOT NULL DEFAULT false,
    "microphone" BOOLEAN NOT NULL DEFAULT false,
    "charging" BOOLEAN NOT NULL DEFAULT false,
    "camera" BOOLEAN NOT NULL DEFAULT false,
    "wifi" BOOLEAN NOT NULL DEFAULT false,
    "biometric" BOOLEAN NOT NULL DEFAULT false,
    "allPassed" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "passedById" TEXT NOT NULL,
    "passedByName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairQc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairQc_repairId_key" ON "RepairQc"("repairId");

-- CreateIndex
CREATE INDEX "RepairQc_repairId_idx" ON "RepairQc"("repairId");

-- AddForeignKey
ALTER TABLE "RepairQc" ADD CONSTRAINT "RepairQc_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
