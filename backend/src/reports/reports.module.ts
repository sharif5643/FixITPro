import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, PermissionGuard],
})
export class ReportsModule {}
