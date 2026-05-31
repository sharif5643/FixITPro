-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "dueDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PurchaseOrder_dueDate_idx" ON "PurchaseOrder"("dueDate");
