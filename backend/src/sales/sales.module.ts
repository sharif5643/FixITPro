import { Module } from '@nestjs/common';
import { SalesController } from './sales.controller';
import { PublicReceiptController } from './public-receipt.controller';
import { SalesService } from './sales.service';
import { SalesAccountingAdapter } from './sales-accounting.adapter';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AccountingModule } from '../accounting/accounting.module';
import { JournalModule } from '../journal/journal.module';
import { LineMessagingModule } from '../line-messaging/line-messaging.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule, AccountingModule, JournalModule, LineMessagingModule],
  controllers: [SalesController, PublicReceiptController],
  providers:   [SalesService, SalesAccountingAdapter, PermissionGuard, TenantActiveGuard],
  exports:     [SalesService, SalesAccountingAdapter],
})
export class SalesModule {}
