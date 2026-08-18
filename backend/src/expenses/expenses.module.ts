import { Module } from '@nestjs/common';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { ExpenseAccountingAdapter } from './expense-accounting.adapter';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AccountingModule } from '../accounting/accounting.module';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports:     [AuditLogModule, AccountingModule, JournalModule],
  controllers: [ExpensesController],
  providers:   [ExpensesService, ExpenseAccountingAdapter, TenantActiveGuard],
  exports:     [ExpensesService],
})
export class ExpensesModule {}
