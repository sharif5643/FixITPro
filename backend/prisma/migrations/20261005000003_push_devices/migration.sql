-- Phones that receive notifications (Firebase Cloud Messaging) for the account signed in on
-- them. New table only; nothing existing changes.
CREATE TABLE IF NOT EXISTS "PushDevice" (
  "id"         TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "platform"   TEXT NOT NULL DEFAULT 'android',
  "app"        TEXT,
  "userId"     TEXT NOT NULL,
  "tenantId"   TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PushDevice_token_key" ON "PushDevice"("token");
CREATE INDEX IF NOT EXISTS "PushDevice_userId_idx" ON "PushDevice"("userId");
DO $$ BEGIN
  ALTER TABLE "PushDevice" ADD CONSTRAINT "PushDevice_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
