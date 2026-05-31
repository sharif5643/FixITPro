-- CreateEnum
CREATE TYPE "StockTransferStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');

-- Add TRANSFER_IN / TRANSFER_OUT to StockMovementType
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_IN';
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER_OUT';

-- CreateTable Branch
CREATE TABLE "Branch" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "address"   TEXT,
    "phone"     TEXT,
    "isActive"  BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Branch_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Branch_isActive_idx" ON "Branch"("isActive");

-- CreateTable BranchStock
CREATE TABLE "BranchStock" (
    "id"        TEXT NOT NULL,
    "quantity"  INTEGER NOT NULL DEFAULT 0,
    "minStock"  INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branchId"  TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    CONSTRAINT "BranchStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BranchStock_branchId_productId_key" ON "BranchStock"("branchId", "productId");
CREATE INDEX "BranchStock_branchId_idx" ON "BranchStock"("branchId");
CREATE INDEX "BranchStock_productId_idx" ON "BranchStock"("productId");

-- CreateTable StockTransfer
CREATE TABLE "StockTransfer" (
    "id"              TEXT NOT NULL,
    "transferNumber"  TEXT NOT NULL,
    "quantity"        INTEGER NOT NULL,
    "status"          "StockTransferStatus" NOT NULL DEFAULT 'PENDING',
    "note"            TEXT,
    "requestedById"   TEXT,
    "requestedByName" TEXT,
    "completedById"   TEXT,
    "completedByName" TEXT,
    "completedAt"     TIMESTAMP(3),
    "cancelledAt"     TIMESTAMP(3),
    "cancelReason"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "fromBranchId"    TEXT NOT NULL,
    "toBranchId"      TEXT NOT NULL,
    "productId"       TEXT NOT NULL,
    CONSTRAINT "StockTransfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StockTransfer_transferNumber_key" ON "StockTransfer"("transferNumber");
CREATE INDEX "StockTransfer_fromBranchId_idx" ON "StockTransfer"("fromBranchId");
CREATE INDEX "StockTransfer_toBranchId_idx" ON "StockTransfer"("toBranchId");
CREATE INDEX "StockTransfer_productId_idx" ON "StockTransfer"("productId");
CREATE INDEX "StockTransfer_status_idx" ON "StockTransfer"("status");
CREATE INDEX "StockTransfer_createdAt_idx" ON "StockTransfer"("createdAt");

-- Add branchId to existing tables (nullable — backward compatible)
ALTER TABLE "User"          ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Sale"          ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Repair"        ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Expense"       ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Shift"         ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "Notification"  ADD COLUMN IF NOT EXISTS "branchId" TEXT;
ALTER TABLE "StockMovement" ADD COLUMN IF NOT EXISTS "branchId" TEXT;

-- Indexes for branchId columns
CREATE INDEX IF NOT EXISTS "User_branchId_idx"          ON "User"("branchId");
CREATE INDEX IF NOT EXISTS "Sale_branchId_idx"          ON "Sale"("branchId");
CREATE INDEX IF NOT EXISTS "Repair_branchId_idx"        ON "Repair"("branchId");
CREATE INDEX IF NOT EXISTS "Expense_branchId_idx"       ON "Expense"("branchId");
CREATE INDEX IF NOT EXISTS "Shift_branchId_idx"         ON "Shift"("branchId");
CREATE INDEX IF NOT EXISTS "Notification_branchId_idx"  ON "Notification"("branchId");
CREATE INDEX IF NOT EXISTS "StockMovement_branchId_idx" ON "StockMovement"("branchId");

-- Foreign keys on BranchStock and StockTransfer
ALTER TABLE "BranchStock"
    ADD CONSTRAINT "BranchStock_branchId_fkey"  FOREIGN KEY ("branchId")  REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "BranchStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockTransfer"
    ADD CONSTRAINT "StockTransfer_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StockTransfer_toBranchId_fkey"   FOREIGN KEY ("toBranchId")   REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "StockTransfer_productId_fkey"    FOREIGN KEY ("productId")    REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Soft FK on tables that now have branchId (SET NULL on branch delete, but branches only soft-delete)
ALTER TABLE "User"          ADD CONSTRAINT "User_branchId_fkey"          FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Sale"          ADD CONSTRAINT "Sale_branchId_fkey"          FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Repair"        ADD CONSTRAINT "Repair_branchId_fkey"        FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense"       ADD CONSTRAINT "Expense_branchId_fkey"       FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Shift"         ADD CONSTRAINT "Shift_branchId_fkey"         FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification"  ADD CONSTRAINT "Notification_branchId_fkey"  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
