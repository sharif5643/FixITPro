import { Module } from '@nestjs/common';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsService } from './tenants/tenants.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';
import { BranchesController } from './branches/branches.controller';
import { BranchesService } from './branches/branches.service';
import { UsersController } from './users/users.controller';
import { UsersService } from './users/users.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { AuditLogsController } from './audit-logs/audit-logs.controller';
import { AuditLogsService } from './audit-logs/audit-logs.service';
import { SettingsController } from './settings/settings.controller';
import { SettingsService } from './settings/settings.service';
import { DataRepairController } from './data-repair/data-repair.controller';
import { DataRepairService } from './data-repair/data-repair.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports: [AuditLogModule],
  controllers: [
    TenantsController,
    PaymentsController,
    BranchesController,
    UsersController,
    AnalyticsController,
    AuditLogsController,
    SettingsController,
    DataRepairController,
  ],
  providers: [
    TenantsService,
    PaymentsService,
    BranchesService,
    UsersService,
    AnalyticsService,
    AuditLogsService,
    SettingsService,
    DataRepairService,
  ],
})
export class SuperAdminModule {}
