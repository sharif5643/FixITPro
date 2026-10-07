-- Shared shifts: one cash drawer used by several people. The first person opens the shift; the
-- others join it (one row each here) and their sales / payments go into that shift. New table
-- only; existing shifts and every other table are unchanged.
CREATE TABLE IF NOT EXISTS "ShiftMember" (
    "id"       TEXT NOT NULL,
    "shiftId"  TEXT NOT NULL,
    "userId"   TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt"   TIMESTAMP(3),
    CONSTRAINT "ShiftMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ShiftMember_shiftId_userId_key" ON "ShiftMember"("shiftId", "userId");
CREATE INDEX IF NOT EXISTS "ShiftMember_userId_leftAt_idx" ON "ShiftMember"("userId", "leftAt");

ALTER TABLE "ShiftMember" ADD CONSTRAINT "ShiftMember_shiftId_fkey"
    FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ShiftMember" ADD CONSTRAINT "ShiftMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
