import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PermissionGuard],
})
export class DashboardModule {}
