-- Additive only: one nullable column, one new table. No existing row is changed.

-- The shift a refund was paid out from (older refunds keep null and count against the sale's shift)
ALTER TABLE "SaleRefund" ADD COLUMN IF NOT EXISTS "shiftId" TEXT;
CREATE INDEX IF NOT EXISTS "SaleRefund_shiftId_idx" ON "SaleRefund"("shiftId");
ALTER TABLE "SaleRefund" ADD CONSTRAINT "SaleRefund_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money in or out of a shift that is not a sale, repair payment or expense
CREATE TABLE IF NOT EXISTS "ShiftCashMovement" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reason" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "shiftId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT,
    CONSTRAINT "ShiftCashMovement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ShiftCashMovement_shiftId_idx" ON "ShiftCashMovement"("shiftId");
CREATE INDEX IF NOT EXISTS "ShiftCashMovement_referenceType_referenceId_idx" ON "ShiftCashMovement"("referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "ShiftCashMovement_tenantId_createdAt_idx" ON "ShiftCashMovement"("tenantId", "createdAt");
ALTER TABLE "ShiftCashMovement" ADD CONSTRAINT "ShiftCashMovement_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
