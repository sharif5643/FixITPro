import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @RequirePermission('reports.view')
  @Get('owner-dashboard')
  getOwnerDashboard(@Query('branchId') branchId?: string) {
    return this.reportsService.getOwnerDashboard(branchId);
  }

  @RequirePermission('reports.view')
  @Get('daily')
  getDailyReport(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const reportDate = date || new Date().toISOString().slice(0, 10);
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getDailyReport(reportDate, effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('summary')
  getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getSummary(startDate || today, endDate || today, effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('void-log')
  getVoidLog(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
  ) {
    const reportDate = date || new Date().toISOString().slice(0, 10);
    return this.reportsService.getVoidLog(reportDate, branchId);
  }

  @RequirePermission('reports.view')
  @Get('daily-closing')
  getDailyClosingReport(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const reportDate = date || new Date().toISOString().slice(0, 10);
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getDailyClosingReport(reportDate, effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('profit')
  getProfitReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('branchId') userBranchId?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getProfitReport(startDate || today, endDate || today, effectiveBranchId);
  }

  @RequirePermission('reports.view')
  @Get('supplier-aging')
  getSupplierAging() {
    return this.reportsService.getSupplierAging();
  }
}
