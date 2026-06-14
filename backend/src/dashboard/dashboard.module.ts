import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PermissionGuard, TenantActiveGuard],
})
export class DashboardModule {}
