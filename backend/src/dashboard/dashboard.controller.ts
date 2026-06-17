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

  @RequirePermission('reports.view')
  @Get('overview')
  getOverview(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role')     role?: string,
    @CurrentUser('branchId') userBranchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    const isOwner = role === 'OWNER' || role === 'SUPER_ADMIN';
    const effectiveBranchId = isOwner ? branchId : (userBranchId ?? undefined);
    return this.dashboardService.getOverview({
      startDate,
      endDate,
      branchId: effectiveBranchId,
      isOwner,
      tenantId,
    });
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
