-- Opening balance ("ยอดยกมา") for stock whose movement history does not add up to what is on the
-- shelf: stock typed in before every change was recorded (products created, enrolled in a branch
-- or set by hand before 2026-10). One ADJUST row per branch + product for the gap, so the stock
-- card explains today's count:
--  - more on the shelf than the history says: stock that was there before the history begins, an
--    opening balance dated just before the first movement (or when the product was created)
--  - less on the shelf: goods that went out unrecorded at some unknown time, so it is dated when
--    this runs and says so, rather than an opening balance below zero
--
-- Adds history rows only: no stock quantity, sale or other row is changed. ADJUST (not IN) keeps
-- the gap out of "stock received" reports. Re-running adds nothing: the id is derived from the
-- branch + product and rows already backfilled are skipped.
-- Signed movement, as in scripts/backup/readonly-checks.sql section 24: in = +, out = -, ADJUST signed.
WITH mv AS (
  SELECT m."branchId", m."productId",
    sum(CASE WHEN m.type::text IN ('IN','REFUND','REPAIR_RETURN','TRANSFER_IN') THEN m.quantity
             WHEN m.type::text IN ('OUT','SALE','REPAIR_USE','TRANSFER_OUT') THEN -m.quantity
             WHEN m.type::text = 'ADJUST' THEN m.quantity ELSE 0 END) AS net,
    min(m."createdAt") AS first_move
  FROM "StockMovement" m
  WHERE m."branchId" IS NOT NULL
  GROUP BY 1, 2
)
INSERT INTO "StockMovement" ("id", "type", "quantity", "note", "referenceType", "productId", "branchId", "createdAt")
SELECT
  'obf_' || md5(bs."branchId" || ':' || bs."productId"),
  'ADJUST',
  bs.quantity - coalesce(mv.net, 0),
  CASE WHEN bs.quantity > coalesce(mv.net, 0)
       THEN 'ยอดยกมา (บันทึกย้อนหลัง): ยอดก่อนระบบเริ่มเก็บประวัติครบ'
       ELSE 'ปรับให้ตรงกับของจริง (บันทึกย้อนหลัง): ของที่ออกไปโดยไม่มีประวัติ' END,
  'OPENING_BALANCE',
  bs."productId",
  bs."branchId",
  CASE WHEN bs.quantity > coalesce(mv.net, 0)
       THEN LEAST(p."createdAt", mv.first_move - INTERVAL '1 second')
       ELSE now() AT TIME ZONE 'UTC' END
FROM "BranchStock" bs
JOIN "Product" p ON p.id = bs."productId"
LEFT JOIN mv ON mv."branchId" = bs."branchId" AND mv."productId" = bs."productId"
WHERE bs.quantity <> coalesce(mv.net, 0)
  AND NOT EXISTS (
    SELECT 1 FROM "StockMovement" x
    WHERE x."branchId" = bs."branchId" AND x."productId" = bs."productId" AND x."referenceType" = 'OPENING_BALANCE'
  )
ON CONFLICT ("id") DO NOTHING;
