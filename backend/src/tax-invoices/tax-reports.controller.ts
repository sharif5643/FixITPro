import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TaxReportsService } from './tax-reports.service';

function shop(tenantId: string | null): string {
  if (!tenantId) throw new ForbiddenException('ต้องเข้าใช้งานในนามร้าน');
  return tenantId;
}

/** Monthly VAT reports for shops that charge VAT (read only) */
@RequireModule('report')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard, PermissionGuard)
@RequirePermission('reports.view')
@Controller('tax-reports')
export class TaxReportsController {
  constructor(private readonly reports: TaxReportsService) {}

  @Get('sales')
  sales(@Query('month') month: string, @Query('branchId') branchId: string | undefined, @CurrentUser('tenantId') tenantId: string | null) {
    return this.reports.sales(shop(tenantId), month, branchId || undefined);
  }

  @Get('purchases')
  purchases(@Query('month') month: string, @Query('branchId') branchId: string | undefined, @CurrentUser('tenantId') tenantId: string | null) {
    return this.reports.purchases(shop(tenantId), month, branchId || undefined);
  }

  @Get('pp30')
  pp30(@Query('month') month: string, @Query('branchId') branchId: string | undefined, @CurrentUser('tenantId') tenantId: string | null) {
    return this.reports.pp30(shop(tenantId), month, branchId || undefined);
  }
}
