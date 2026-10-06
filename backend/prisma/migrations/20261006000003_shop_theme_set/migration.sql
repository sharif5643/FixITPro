-- The shop's theme set (original = the product's own look) and light / dark / auto.
-- Two nullable columns; nothing existing changes, and every shop stays on the original look
-- until its owner picks a theme.
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "themeKey"    TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "themePreset" TEXT;
