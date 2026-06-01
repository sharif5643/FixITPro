import { Module } from '@nestjs/common';
import { DebtPaymentsController } from './debt-payments.controller';
import { DebtPaymentsService } from './debt-payments.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [DebtPaymentsController],
  providers:   [DebtPaymentsService, PermissionGuard],
})
export class DebtPaymentsModule {}
