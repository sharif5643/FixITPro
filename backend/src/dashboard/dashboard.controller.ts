import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  /**
   * Everyone signed in gets the work figures of their branch (repairs, stock, warranties,
   * shift), which the cashier / technician / stock dashboards show. Money,
   * profit and rankings need reports.view; a cashier (sales.create) also gets the POS sales
   * count and total, which the cashier dashboard shows.
   */
  @Get('overview')
  async getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role')     role?: string,
    @CurrentUser('branchId') userBranchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser('permissions') permissions?: string[],
  ) {
    const isOwner = role === 'OWNER' || role === 'SUPER_ADMIN';
    const effectiveBranchId = isOwner ? branchId : (userBranchId ?? undefined);
    const overview = await this.dashboardService.getOverview({
      startDate,
      endDate,
      branchId: effectiveBranchId,
      isOwner,
      tenantId,
    });
    const perms = permissions ?? [];
    if (isOwner || perms.includes('reports.view')) return overview;
    const o = overview as any;
    return {
      period:        o.period,
      finance:       perms.includes('sales.create')
        ? { salesRevenue: o.finance?.salesRevenue, salesCount: o.finance?.salesCount }
        : {},
      repairOps:     { ...o.repairOps, unpaidDebtTotal: undefined, unpaidDebtCount: undefined },
      stock:         o.stock,
      warranties:    o.warranties,
      currentShift:  o.currentShift,
    };
  }

  @UseGuards(TenantActiveGuard)
  @RequirePermission('reports.view')
  @Get('owner-summary')
  getOwnerSummary(
    @CurrentUser('role')     role?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    if (!['OWNER', 'MANAGER', 'SUPER_ADMIN'].includes(role ?? '')) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงข้อมูลสรุปเจ้าของ');
    }
    return this.dashboardService.getOwnerSummary(tenantId);
  }
}
