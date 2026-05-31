-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'SUSPENDED');

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" SERIAL NOT NULL,
    "shopName" TEXT NOT NULL DEFAULT 'FixITPro',
    "shopPhone" TEXT,
    "shopAddress" TEXT,
    "shopEmail" TEXT,
    "taxId" TEXT,
    "logoUrl" TEXT,
    "receiptFooter" TEXT,
    "paperWidth" TEXT NOT NULL DEFAULT '80mm',
    "vatPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "defaultDeposit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "autoGenerateSku" BOOLEAN NOT NULL DEFAULT true,
    "autoGenerateBarcode" BOOLEAN NOT NULL DEFAULT false,
    "autoPrint" BOOLEAN NOT NULL DEFAULT false,
    "lowStockAlert" INTEGER NOT NULL DEFAULT 5,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" SERIAL NOT NULL,
    "planName" TEXT NOT NULL DEFAULT 'Trial',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionRenewal" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(10,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subscriptionId" INTEGER NOT NULL,

    CONSTRAINT "SubscriptionRenewal_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SubscriptionRenewal" ADD CONSTRAINT "SubscriptionRenewal_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
