-- A notification can be addressed to one user (e.g. the technician a repair was assigned to).
-- NULL keeps today's behaviour (visible to the branch / tenant). Additive and idempotent.
ALTER TABLE "Notification" ADD COLUMN IF NOT EXISTS "userId" TEXT;
CREATE INDEX IF NOT EXISTS "Notification_userId_idx" ON "Notification"("userId");
