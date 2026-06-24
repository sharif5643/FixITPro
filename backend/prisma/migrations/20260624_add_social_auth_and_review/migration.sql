-- AlterTable: add social auth fields to User
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lineUserId" TEXT;

-- CreateIndex: unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "User_googleId_key" ON "User"("googleId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_lineUserId_key" ON "User"("lineUserId");

-- CreateTable: RepairReview
CREATE TABLE IF NOT EXISTS "RepairReview" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "RepairReview_repairId_key" ON "RepairReview"("repairId");
CREATE INDEX IF NOT EXISTS "RepairReview_repairId_idx" ON "RepairReview"("repairId");

-- AddForeignKey
ALTER TABLE "RepairReview" DROP CONSTRAINT IF EXISTS "RepairReview_repairId_fkey";
ALTER TABLE "RepairReview" ADD CONSTRAINT "RepairReview_repairId_fkey"
    FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;
