-- DropForeignKey
ALTER TABLE "PackageModule" DROP CONSTRAINT "PackageModule_moduleKey_fkey";

-- DropForeignKey
ALTER TABLE "PackageModule" DROP CONSTRAINT "PackageModule_packageKey_fkey";

-- DropForeignKey
ALTER TABLE "TenantModule" DROP CONSTRAINT "TenantModule_moduleKey_fkey";

-- DropForeignKey
ALTER TABLE "TenantModule" DROP CONSTRAINT "TenantModule_tenantId_fkey";

-- AlterTable
ALTER TABLE "Package" ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TenantModule" ALTER COLUMN "expiresAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "createdAt" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updatedAt" DROP DEFAULT,
ALTER COLUMN "updatedAt" SET DATA TYPE TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "PackageModule" ADD CONSTRAINT "PackageModule_packageKey_fkey" FOREIGN KEY ("packageKey") REFERENCES "Package"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackageModule" ADD CONSTRAINT "PackageModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "AppModule"("key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "AppModule"("key") ON DELETE RESTRICT ON UPDATE CASCADE;
