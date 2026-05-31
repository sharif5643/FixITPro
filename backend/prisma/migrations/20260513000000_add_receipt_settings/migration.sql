-- AlterTable: add 4 receipt/settings fields to ShopSettings
ALTER TABLE "ShopSettings" ADD COLUMN "repairWarrantyText" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "paymentQrUrl" TEXT;
ALTER TABLE "ShopSettings" ADD COLUMN "showTaxId" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN "showLogo" BOOLEAN NOT NULL DEFAULT true;
