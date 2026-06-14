import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports:     [AuditLogModule],
  controllers: [ExpensesController],
  providers:   [ExpensesService, TenantActiveGuard],
  exports:     [ExpensesService],
})
export class ExpensesModule {}
