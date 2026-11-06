-- Owner hub ("ห้องเจ้าของร้าน"): one page of today's money and what needs the owner, and a LINE
-- summary every evening. It is in no package: a shop has it only when the super admin switches it
-- on for that shop. Additive only: one new module row and one new column with a default; nothing
-- existing is changed or removed.
INSERT INTO "AppModule" ("key", "name", "description", "isActive")
VALUES ('owner_hub', 'ห้องเจ้าของร้าน', 'เงินวันนี้ทุกสาขาในหน้าเดียว เรื่องที่ต้องจัดการ และสรุปยอดเข้า LINE เจ้าของทุก 3 ทุ่ม', true)
ON CONFLICT ("key") DO NOTHING;

-- The owner can stop the evening LINE summary without unlinking LINE
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "ownerDailyLine" BOOLEAN NOT NULL DEFAULT true;
