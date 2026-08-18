import { Module } from '@nestjs/common';
import { DebtPaymentsController } from './debt-payments.controller';
import { DebtPaymentsService } from './debt-payments.service';
import { RepairAccountingAdapter } from '../repairs/repair-accounting.adapter';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountingModule } from '../accounting/accounting.module';
import { JournalModule } from '../journal/journal.module';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  imports:     [AuditLogModule, NotificationsModule, AccountingModule, JournalModule],
  controllers: [DebtPaymentsController],
  providers:   [DebtPaymentsService, RepairAccountingAdapter, PermissionGuard],
})
export class DebtPaymentsModule {}
