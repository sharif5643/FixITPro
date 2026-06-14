import { Module } from '@nestjs/common';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [SettingsController],
  providers:   [SettingsService, PermissionGuard, TenantActiveGuard],
  exports:     [SettingsService],
})
export class SettingsModule {}
