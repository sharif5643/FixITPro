import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

const IS_ELEVATED = (role: string) => role === 'OWNER' || role === 'SUPER_ADMIN';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @RequirePermission('reports.view')
  @Get('overview')
  getOverview(
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const effectiveBranchId = IS_ELEVATED(role ?? '') ? branchId : (userBranchId ?? undefined);
    return this.analyticsService.getOverview(effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('dead-stock')
  getDeadStock(
    @Query('branchId') branchId?: string,
    @Query('days') days?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const effectiveBranchId = IS_ELEVATED(role ?? '') ? branchId : (userBranchId ?? undefined);
    return this.analyticsService.getDeadStock(effectiveBranchId, days ? parseInt(days, 10) : 30);
  }

  @Roles('OWNER', 'SUPER_ADMIN')
  @UseGuards(RolesGuard)
  @RequirePermission('reports.view')
  @Get('branch-stock')
  getBranchStock(
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const effectiveBranchId = IS_ELEVATED(role ?? '') ? branchId : (userBranchId ?? undefined);
    return this.analyticsService.getBranchStock(effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('repair-aging')
  getRepairAging(
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const effectiveBranchId = IS_ELEVATED(role ?? '') ? branchId : (userBranchId ?? undefined);
    return this.analyticsService.getRepairAging(effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('top-profit-products')
  getTopProfitProducts(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const effectiveBranchId = IS_ELEVATED(role ?? '') ? branchId : (userBranchId ?? undefined);
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(`${startDate ?? today}T00:00:00+07:00`);
    const end   = new Date(`${endDate   ?? today}T23:59:59+07:00`);
    return this.analyticsService.getTopProfitProducts(effectiveBranchId, start, end);
  }

  @RequirePermission('reports.view')
  @Get('technician-trends')
  getTechnicianTrends(
    @Query('branchId') branchId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const effectiveBranchId = IS_ELEVATED(role ?? '') ? branchId : (userBranchId ?? undefined);
    const today = new Date().toISOString().slice(0, 10);
    const start = new Date(`${startDate ?? new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}T00:00:00+07:00`);
    const end   = new Date(`${endDate ?? today}T23:59:59+07:00`);
    return this.analyticsService.getTechnicianTrends(effectiveBranchId, start, end);
  }
}
