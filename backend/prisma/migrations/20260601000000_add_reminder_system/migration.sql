-- CreateTable
CREATE TABLE "ReminderSettings" (
    "id"                     TEXT NOT NULL,
    "userId"                 TEXT NOT NULL,
    "enabled"                BOOLEAN NOT NULL DEFAULT true,
    "soundEnabled"           BOOLEAN NOT NULL DEFAULT true,
    "soundVolume"            INTEGER NOT NULL DEFAULT 80,
    "popupIntervalMinutes"   INTEGER NOT NULL DEFAULT 1,
    "urgentRepairEnabled"    BOOLEAN NOT NULL DEFAULT true,
    "transferPendingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pickupWaitingEnabled"   BOOLEAN NOT NULL DEFAULT true,
    "vipRepairEnabled"       BOOLEAN NOT NULL DEFAULT true,
    "partsRequestEnabled"    BOOLEAN NOT NULL DEFAULT true,
    "updatedAt"              TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSnooze" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "entityType"  TEXT NOT NULL,
    "entityId"    TEXT NOT NULL,
    "snoozeUntil" TIMESTAMP(3) NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSnooze_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (unique per user — one settings row per user)
CREATE UNIQUE INDEX "ReminderSettings_userId_key" ON "ReminderSettings"("userId");

-- CreateIndex (unique snooze per user+entity)
CREATE UNIQUE INDEX "ReminderSnooze_userId_entityType_entityId_key" ON "ReminderSnooze"("userId", "entityType", "entityId");

-- CreateIndex (covers getActiveReminders query — filter by userId, exclude expired)
CREATE INDEX "ReminderSnooze_userId_snoozeUntil_idx" ON "ReminderSnooze"("userId", "snoozeUntil");

-- CreateIndex (covers purgeExpiredSnoozes cleanup query)
CREATE INDEX "ReminderSnooze_snoozeUntil_idx" ON "ReminderSnooze"("snoozeUntil");

-- AddForeignKey (CASCADE: deleting a user removes their settings)
ALTER TABLE "ReminderSettings" ADD CONSTRAINT "ReminderSettings_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey (CASCADE: deleting a user removes all their snoozes)
ALTER TABLE "ReminderSnooze" ADD CONSTRAINT "ReminderSnooze_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
