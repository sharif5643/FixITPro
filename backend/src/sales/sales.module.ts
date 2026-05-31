import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';
import { PermissionGuard } from '../common/guards/permission.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [SalesController],
  providers:   [SalesService, PermissionGuard],
  exports:     [SalesService],
})
export class SalesModule {}
