import { Module } from '@nestjs/common';
import { BranchesController } from './branches.controller';
import { BranchesService } from './branches.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule, PlanLimitsModule],
  controllers: [BranchesController],
  providers:   [BranchesService],
  exports:     [BranchesService],
})
export class BranchesModule {}
