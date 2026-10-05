-- LINE for staff: each shop connects its own LINE Official Account (channel secret for its own
-- webhook, OA ID for the add-friend link), and a staff member links their LINE to get job
-- alerts. Three nullable columns; nothing existing changes.
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "lineChannelSecret" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "lineOaId" TEXT;
-- The staff member's user id on their shop's Official Account (not the LINE Login id in lineUserId)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lineNotifyId" TEXT;
