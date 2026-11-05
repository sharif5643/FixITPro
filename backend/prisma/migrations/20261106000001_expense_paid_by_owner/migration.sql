-- An expense the owner paid from their own pocket (not the drawer or the shop's account).
-- Additive only: existing expenses keep false.
ALTER TABLE "Expense" ADD COLUMN IF NOT EXISTS "paidByOwner" BOOLEAN NOT NULL DEFAULT false;

-- Delivery fees the owner paid since 5 Nov were saved with this note (only the new column is set)
UPDATE "Expense" SET "paidByOwner" = true
WHERE "paidByOwner" = false AND "shiftId" IS NULL AND note = 'เจ้าของจ่ายเอง (ไม่ได้ใช้เงินในลิ้นชัก)';
