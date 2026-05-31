-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- AlterTable: Branch — add branchNumber, status, stockCodeSeq
ALTER TABLE "Branch"
  ADD COLUMN "branchNumber" INTEGER,
  ADD COLUMN "status"       "BranchStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "stockCodeSeq" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: BranchStock — add stockCode
ALTER TABLE "BranchStock"
  ADD COLUMN "stockCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BranchStock_stockCode_key" ON "BranchStock"("stockCode");

-- CreateIndex
CREATE INDEX "Branch_status_idx" ON "Branch"("status");
