-- Platform-wide keys set from Super Admin (LINE account, AI key). Additive only: a new table.
CREATE TABLE IF NOT EXISTS "PlatformSecret" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlatformSecret_pkey" PRIMARY KEY ("key")
);
