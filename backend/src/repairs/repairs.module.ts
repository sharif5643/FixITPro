import { Module } from '@nestjs/common';
import { RepairsController } from './repairs.controller';
import { RepairsService } from './repairs.service';
import { RepairAccountingAdapter } from './repair-accounting.adapter';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WarrantiesModule } from '../warranties/warranties.module';
import { LineMessagingModule } from '../line-messaging/line-messaging.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports:     [AuditLogModule, WarrantiesModule, LineMessagingModule, AccountingModule, PlanLimitsModule, JournalModule],
  controllers: [RepairsController],
  providers:   [RepairsService, RepairAccountingAdapter, TenantActiveGuard, PermissionGuard],
  exports:     [RepairsService],
})
export class RepairsModule {}
