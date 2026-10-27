-- Staff link their LINE chat with FixITPro's LINE account to report SIM / package sales there.
-- Additive only: a nullable column and its unique index.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lineChatId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "User_lineChatId_key" ON "User"("lineChatId");
