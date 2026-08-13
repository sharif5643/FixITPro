import { Module } from '@nestjs/common';
import { RepairsController } from './repairs.controller';
import { RepairsService } from './repairs.service';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WarrantiesModule } from '../warranties/warranties.module';
import { LineMessagingModule } from '../line-messaging/line-messaging.module';
import { AccountingModule } from '../accounting/accounting.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports:     [AuditLogModule, WarrantiesModule, LineMessagingModule, AccountingModule, PlanLimitsModule],
  controllers: [RepairsController],
  providers:   [RepairsService, TenantActiveGuard, PermissionGuard],
  exports:     [RepairsService],
})
export class RepairsModule {}
