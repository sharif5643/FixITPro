-- AlterTable: add repair intake fields (deviceColor, dueDate, accessories)
ALTER TABLE "Repair"
  ADD COLUMN "deviceColor" TEXT,
  ADD COLUMN "dueDate"     TIMESTAMP(3),
  ADD COLUMN "accessories" TEXT;
