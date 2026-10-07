import { Module } from '@nestjs/common';
import { TenantBackupService } from './tenant-backup.service';
import { TenantRestoreService } from './tenant-restore.service';
import { TenantBackupController } from './tenant-backup.controller';
import { ShopBackupController } from './shop-backup.controller';
import { DatabaseModule } from '../database/database.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { SuperAdminAuditInterceptor } from '../super-admin/super-admin-audit.interceptor';

@Module({
  imports: [DatabaseModule, AuditLogModule],
  controllers: [TenantBackupController, ShopBackupController],
  providers: [TenantBackupService, TenantRestoreService, SuperAdminAuditInterceptor],
  exports: [TenantBackupService, TenantRestoreService],
})
export class TenantBackupModule {}
