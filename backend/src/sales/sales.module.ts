import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule, AccountingModule],
  controllers: [SalesController],
  providers:   [SalesService, PermissionGuard, TenantActiveGuard],
  exports:     [SalesService],
})
export class SalesModule {}
