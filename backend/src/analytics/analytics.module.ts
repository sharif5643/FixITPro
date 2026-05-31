import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, PermissionGuard],
})
export class AnalyticsModule {}
