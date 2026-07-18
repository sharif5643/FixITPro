import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from './reconciliation.service';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';

@Module({
  controllers: [ReconciliationController],
  providers:   [ReconciliationService, PermissionGuard, TenantActiveGuard],
  exports:     [ReconciliationService],
})
export class ReconciliationModule {}
