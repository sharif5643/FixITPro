import { Module } from '@nestjs/common';
import { AccountingReconciliationController } from './accounting-reconciliation.controller';
import { AccountingReconciliationService } from './accounting-reconciliation.service';
import { SalesModule } from '../sales/sales.module';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';

@Module({
  imports:     [SalesModule],
  controllers: [AccountingReconciliationController],
  providers:   [AccountingReconciliationService, PermissionGuard, TenantActiveGuard],
  exports:     [AccountingReconciliationService],
})
export class AccountingReconciliationModule {}
