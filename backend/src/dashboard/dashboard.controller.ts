import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
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
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const isOwner = role === 'OWNER' || role === 'SUPER_ADMIN';
    const effectiveBranchId = isOwner ? branchId : (userBranchId ?? undefined);
    return this.dashboardService.getOverview({
      startDate,
      endDate,
      branchId: effectiveBranchId,
      isOwner,
    });
  }
}
