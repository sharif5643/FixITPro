-- AlterTable: make email optional
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- AlterTable: add username column
ALTER TABLE "User" ADD COLUMN "username" TEXT;

-- CreateIndex: unique constraint on username
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
