-- CreateTable
CREATE TABLE "RepairMessage" (
    "id" TEXT NOT NULL,
    "repairId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RepairMessage_repairId_createdAt_idx" ON "RepairMessage"("repairId", "createdAt");

-- CreateIndex
CREATE INDEX "RepairMessage_senderId_idx" ON "RepairMessage"("senderId");

-- AddForeignKey
ALTER TABLE "RepairMessage" ADD CONSTRAINT "RepairMessage_repairId_fkey" FOREIGN KEY ("repairId") REFERENCES "Repair"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RepairMessage" ADD CONSTRAINT "RepairMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
