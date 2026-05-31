-- Link Expense to Shift for correct cash drawer accounting.
-- shiftId is nullable: old expenses and non-shift expenses remain unlinked.
ALTER TABLE "Expense" ADD COLUMN "shiftId" TEXT;

ALTER TABLE "Expense"
  ADD CONSTRAINT "Expense_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "Shift"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Expense_shiftId_idx" ON "Expense"("shiftId");
