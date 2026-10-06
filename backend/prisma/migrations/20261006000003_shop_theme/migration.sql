-- The shop's own look (main colour, light / dark / auto). Two nullable columns; nothing existing
-- changes. Shops that picked a colour when signing up get it from their sign-up record at read time.
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "themeColor"  TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "themePreset" TEXT;
