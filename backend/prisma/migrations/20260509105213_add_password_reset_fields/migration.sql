-- AlterTable
ALTER TABLE "User" ADD COLUMN     "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastPasswordChangedAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetAt" TIMESTAMP(3),
ADD COLUMN     "passwordResetById" TEXT;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_passwordResetById_fkey" FOREIGN KEY ("passwordResetById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
