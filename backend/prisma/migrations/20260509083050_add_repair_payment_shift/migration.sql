-- AlterTable
ALTER TABLE "Repair" ADD COLUMN     "paymentShiftId" TEXT;

-- CreateIndex
CREATE INDEX "Repair_paymentShiftId_idx" ON "Repair"("paymentShiftId");

-- AddForeignKey
ALTER TABLE "Repair" ADD CONSTRAINT "Repair_paymentShiftId_fkey" FOREIGN KEY ("paymentShiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
