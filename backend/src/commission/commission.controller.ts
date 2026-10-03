import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CommissionService } from './commission.service';
import { UpdateCommissionConfigDto } from './commission.dto';

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('commission')
export class CommissionController {
  constructor(private readonly svc: CommissionService) {}

  /** Everyone's earnings for a period (owners / managers) */
  @Get('report')
  @RequirePermission('reports.view')
  report(@Query() query: { startDate?: string; endDate?: string }, @CurrentUser('tenantId') tenantId: string) {
    return this.svc.getReport(query, tenantId);
  }

  @Get('config')
  @RequirePermission('reports.view')
  config(@CurrentUser('tenantId') tenantId: string) {
    return this.svc.getConfig(tenantId);
  }

  @Put('config')
  @RequirePermission('settings.manage')
  update(@Body() dto: UpdateCommissionConfigDto, @CurrentUser('tenantId') tenantId: string) {
    return this.svc.updateConfig(dto, tenantId);
  }

  /** Staff to pick as the seller at checkout */
  @Get('sellers')
  @RequirePermission('sales.create')
  sellers(@CurrentUser('tenantId') tenantId: string) {
    return this.svc.sellers(tenantId);
  }
}
