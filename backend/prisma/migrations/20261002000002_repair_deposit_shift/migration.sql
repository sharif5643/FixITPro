-- Link repair deposits to the shift that received them so shift expected cash includes them.
-- Additive and idempotent: no existing row is changed.
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "depositShiftId" TEXT;
ALTER TABLE "Repair" ADD COLUMN IF NOT EXISTS "depositPaymentMethod" "PaymentMethod";
CREATE INDEX IF NOT EXISTS "Repair_depositShiftId_idx" ON "Repair"("depositShiftId");
CREATE INDEX IF NOT EXISTS "RepairAdditionalPayment_shiftId_idx" ON "RepairAdditionalPayment"("shiftId");
