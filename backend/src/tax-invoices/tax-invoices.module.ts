import { Global, Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { ModulesModule } from '../modules/modules.module';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TaxInvoicesService } from './tax-invoices.service';
import { TaxReportsService } from './tax-reports.service';
import { TaxReportsController } from './tax-reports.controller';

@Global()
@Module({
  imports:     [JournalModule, ModulesModule],
  controllers: [TaxReportsController],
  providers:   [TaxInvoicesService, TaxReportsService, TenantActiveGuard, PermissionGuard],
  exports:     [TaxInvoicesService],
})
export class TaxInvoicesModule {}
