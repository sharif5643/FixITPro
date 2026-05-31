import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [BackupController],
  providers:   [BackupService, PermissionGuard],
})
export class BackupModule {}
