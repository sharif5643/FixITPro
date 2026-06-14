-- AlterTable: add optional price column to Package
ALTER TABLE "Package" ADD COLUMN "price" DECIMAL(10,2);
