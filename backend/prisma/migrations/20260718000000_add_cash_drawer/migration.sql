-- CreateEnum
CREATE TYPE "CashDrawerSessionStatus" AS ENUM ('OPEN', 'PENDING_APPROVAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "CashDrawerTransactionType" AS ENUM ('OPENING', 'DEPOSIT', 'WITHDRAWAL', 'BANK_DEPOSIT', 'REVERSAL');

-- CreateEnum
CREATE TYPE "CashDrawerTransactionDirection" AS ENUM ('IN', 'OUT');

-- CreateTable
CREATE TABLE "CashDrawer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT,

    CONSTRAINT "CashDrawer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDrawerSession" (
    "id" TEXT NOT NULL,
    "status" "CashDrawerSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingAmount" DECIMAL(10,2) NOT NULL,
    "closedAt" TIMESTAMP(3),
    "expectedAmount" DECIMAL(10,2),
    "countedAmount" DECIMAL(10,2),
    "differenceAmount" DECIMAL(10,2),
    "closingNote" TEXT,
    "differenceReason" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,
    "branchId" TEXT,
    "cashDrawerId" TEXT NOT NULL,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "approvedById" TEXT,

    CONSTRAINT "CashDrawerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDrawerParticipant" (
    "id" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CashDrawerParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDrawerTransaction" (
    "id" TEXT NOT NULL,
    "type" "CashDrawerTransactionType" NOT NULL,
    "direction" "CashDrawerTransactionDirection" NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "reversalOfId" TEXT,
    "reason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT,
    "branchId" TEXT,
    "sessionId" TEXT NOT NULL,
    "cashDrawerId" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,

    CONSTRAINT "CashDrawerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashDrawer_code_branchId_key" ON "CashDrawer"("code", "branchId");
CREATE INDEX "CashDrawer_tenantId_idx" ON "CashDrawer"("tenantId");
CREATE INDEX "CashDrawer_branchId_idx" ON "CashDrawer"("branchId");
CREATE INDEX "CashDrawer_isActive_idx" ON "CashDrawer"("isActive");

CREATE INDEX "CashDrawerSession_tenantId_idx" ON "CashDrawerSession"("tenantId");
CREATE INDEX "CashDrawerSession_branchId_idx" ON "CashDrawerSession"("branchId");
CREATE INDEX "CashDrawerSession_cashDrawerId_status_idx" ON "CashDrawerSession"("cashDrawerId", "status");
CREATE INDEX "CashDrawerSession_openedAt_idx" ON "CashDrawerSession"("openedAt");
CREATE INDEX "CashDrawerSession_status_idx" ON "CashDrawerSession"("status");

CREATE UNIQUE INDEX "CashDrawerParticipant_sessionId_userId_key" ON "CashDrawerParticipant"("sessionId", "userId");
CREATE INDEX "CashDrawerParticipant_sessionId_idx" ON "CashDrawerParticipant"("sessionId");
CREATE INDEX "CashDrawerParticipant_userId_idx" ON "CashDrawerParticipant"("userId");

CREATE INDEX "CashDrawerTransaction_sessionId_idx" ON "CashDrawerTransaction"("sessionId");
CREATE INDEX "CashDrawerTransaction_cashDrawerId_idx" ON "CashDrawerTransaction"("cashDrawerId");
CREATE INDEX "CashDrawerTransaction_tenantId_createdAt_idx" ON "CashDrawerTransaction"("tenantId", "createdAt");
CREATE INDEX "CashDrawerTransaction_branchId_createdAt_idx" ON "CashDrawerTransaction"("branchId", "createdAt");
CREATE INDEX "CashDrawerTransaction_type_direction_idx" ON "CashDrawerTransaction"("type", "direction");
CREATE INDEX "CashDrawerTransaction_referenceType_referenceId_idx" ON "CashDrawerTransaction"("referenceType", "referenceId");

-- AddForeignKey
ALTER TABLE "CashDrawer" ADD CONSTRAINT "CashDrawer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawer" ADD CONSTRAINT "CashDrawer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_cashDrawerId_fkey" FOREIGN KEY ("cashDrawerId") REFERENCES "CashDrawer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerSession" ADD CONSTRAINT "CashDrawerSession_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashDrawerParticipant" ADD CONSTRAINT "CashDrawerParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashDrawerSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashDrawerParticipant" ADD CONSTRAINT "CashDrawerParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CashDrawerTransaction" ADD CONSTRAINT "CashDrawerTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerTransaction" ADD CONSTRAINT "CashDrawerTransaction_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashDrawerTransaction" ADD CONSTRAINT "CashDrawerTransaction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "CashDrawerSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerTransaction" ADD CONSTRAINT "CashDrawerTransaction_cashDrawerId_fkey" FOREIGN KEY ("cashDrawerId") REFERENCES "CashDrawer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashDrawerTransaction" ADD CONSTRAINT "CashDrawerTransaction_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
