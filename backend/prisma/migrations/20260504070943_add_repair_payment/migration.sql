-- AlterTable
ALTER TABLE "Repair" ADD COLUMN     "paidAmount" DECIMAL(10,2),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING';
