import { Global, Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { ModulesModule } from '../modules/modules.module';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TaxInvoicesService } from './tax-invoices.service';
import { TaxReportsService } from './tax-reports.service';
import { TaxReportsController } from './tax-reports.controller';
import { WithholdingTaxService } from './withholding-tax.service';
import { WithholdingTaxController } from './withholding-tax.controller';

@Global()
@Module({
  imports:     [JournalModule, ModulesModule],
  controllers: [TaxReportsController, WithholdingTaxController],
  providers:   [TaxInvoicesService, TaxReportsService, WithholdingTaxService, TenantActiveGuard, PermissionGuard],
  exports:     [TaxInvoicesService, WithholdingTaxService],
})
export class TaxInvoicesModule {}
