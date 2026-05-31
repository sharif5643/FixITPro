-- Phase A: Refund, Debt, CRM schema additions

-- Add PARTIAL_REFUND to SaleStatus enum
ALTER TYPE "SaleStatus" ADD VALUE IF NOT EXISTS 'PARTIAL_REFUND';

-- Add REFUND to StockMovementType enum
ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'REFUND';

-- Add tags to Customer
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Add customerId to PackageSale
ALTER TABLE "PackageSale" ADD COLUMN IF NOT EXISTS "customerId" TEXT;
ALTER TABLE "PackageSale" ADD CONSTRAINT "PackageSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "PackageSale_customerId_idx" ON "PackageSale"("customerId");

-- Add warranty fields to Repair
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "warrantyExpiresAt" TIMESTAMP(3);
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "warrantyNote" TEXT;

-- Add index on Repair.deviceImei
CREATE INDEX IF NOT EXISTS "Repair_deviceImei_idx" ON "Repair"("deviceImei");

-- Add repairId to Claim
ALTER TABLE "Claim" ADD COLUMN IF NOT EXISTS "repairId" TEXT;
ALTER TABLE "Claim" ADD CONSTRAINT "Claim_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "Claim_repairId_idx" ON "Claim"("repairId");

-- Add refundedQty to SaleItem
ALTER TABLE "SaleItem" ADD COLUMN IF NOT EXISTS "refundedQty" INTEGER NOT NULL DEFAULT 0;

-- Create SaleRefund table
CREATE TABLE IF NOT EXISTS "SaleRefund" (
    "id" TEXT NOT NULL,
    "refundNumber" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "totalRefund" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "SaleRefund_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SaleRefund_refundNumber_key" ON "SaleRefund"("refundNumber");
CREATE INDEX IF NOT EXISTS "SaleRefund_saleId_idx" ON "SaleRefund"("saleId");
CREATE INDEX IF NOT EXISTS "SaleRefund_createdAt_idx" ON "SaleRefund"("createdAt");
CREATE INDEX IF NOT EXISTS "SaleRefund_customerId_idx" ON "SaleRefund"("customerId");
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create SaleRefundItem table
CREATE TABLE IF NOT EXISTS "SaleRefundItem" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "refundPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "refundId" TEXT NOT NULL,
    "saleItemId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "SaleRefundItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SaleRefundItem_refundId_idx" ON "SaleRefundItem"("refundId");
CREATE INDEX IF NOT EXISTS "SaleRefundItem_saleItemId_idx" ON "SaleRefundItem"("saleItemId");
ALTER TABLE "SaleRefundItem" ADD CONSTRAINT "SaleRefundItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "SaleRefund"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleRefundItem" ADD CONSTRAINT "SaleRefundItem_saleItemId_fkey" FOREIGN KEY ("saleItemId") REFERENCES "SaleItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SaleRefundItem" ADD CONSTRAINT "SaleRefundItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create RepairPaymentReversal table
CREATE TABLE IF NOT EXISTS "RepairPaymentReversal" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repairId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "RepairPaymentReversal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RepairPaymentReversal_repairId_idx" ON "RepairPaymentReversal"("repairId");
CREATE INDEX IF NOT EXISTS "RepairPaymentReversal_createdAt_idx" ON "RepairPaymentReversal"("createdAt");
ALTER TABLE "RepairPaymentReversal" ADD CONSTRAINT "RepairPaymentReversal_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairPaymentReversal" ADD CONSTRAINT "RepairPaymentReversal_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create RepairAdditionalPayment table
CREATE TABLE IF NOT EXISTS "RepairAdditionalPayment" (
    "id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repairId" TEXT NOT NULL,
    "shiftId" TEXT,
    "createdById" TEXT NOT NULL,

    CONSTRAINT "RepairAdditionalPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "RepairAdditionalPayment_repairId_idx" ON "RepairAdditionalPayment"("repairId");
CREATE INDEX IF NOT EXISTS "RepairAdditionalPayment_createdAt_idx" ON "RepairAdditionalPayment"("createdAt");
ALTER TABLE "RepairAdditionalPayment" ADD CONSTRAINT "RepairAdditionalPayment_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RepairAdditionalPayment" ADD CONSTRAINT "RepairAdditionalPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
