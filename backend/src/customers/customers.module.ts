import { Module } from '@nestjs/common';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [CustomersController],
  providers:   [CustomersService, PermissionGuard],
  exports:     [CustomersService],
})
export class CustomersModule {}
