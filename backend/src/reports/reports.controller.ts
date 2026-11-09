import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CostFixService } from './cost-fix.service';
import { FixCostDto } from './dto/fix-cost.dto';
import { canViewCost, stripCost } from '../common/interceptors/hide-cost.interceptor';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { bangkokDate } from '../common/bangkok-date';

@RequireModule('report')
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard, ModuleGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService, private costFix: CostFixService) {}

  // ── Fixing a wrong cost (owner only): the product, and the bills sold with it ─────────────
  private ownerOnly(role?: string, tenantId?: string | null): string {
    if (role !== 'OWNER' || !tenantId) throw new ForbiddenException('เฉพาะเจ้าของร้านแก้ราคาทุนได้');
    return tenantId;
  }

  @RequirePermission('reports.view')
  @Get('fix-cost/preview')
  previewCostFix(
    @Query('productId') productId: string,
    @Query('costPrice') costPrice?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    const cost = costPrice != null && costPrice !== '' ? Number(costPrice) : undefined;
    return this.costFix.preview(productId, this.ownerOnly(role, tenantId), Number.isFinite(cost) ? cost : undefined);
  }

  @RequirePermission('reports.view')
  @Post('fix-cost')
  fixCost(
    @Body() dto: FixCostDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('name') name?: string,
    @CurrentUser('role') role?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    return this.costFix.fix(dto, { id: userId, name, tenantId: this.ownerOnly(role, tenantId) });
  }

  // Basic for every shop that sells or repairs (end-of-day slip, today's figures), not only with reports
  @RequireModule('report', 'pos', 'repair')
  @RequirePermission('reports.view')
  @Get('owner-dashboard')
  getOwnerDashboard(
    @Query('branchId') branchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    return this.reportsService.getOwnerDashboard(branchId, tenantId);
  }

  @RequirePermission('reports.view')
  @Get('daily')
  getDailyReport(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role')     role?: string,
    @CurrentUser('branchId') userBranchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    const reportDate = date || bangkokDate();
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getDailyReport(reportDate, effectiveBranchId, tenantId);
  }

  @RequirePermission('reports.view')
  @Get('summary')
  getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role')     role?: string,
    @CurrentUser('branchId') userBranchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    const today = bangkokDate();
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getSummary(startDate || today, endDate || today, effectiveBranchId, tenantId);
  }

  @RequirePermission('reports.view')
  @Get('void-log')
  getVoidLog(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    const reportDate = date || bangkokDate();
    return this.reportsService.getVoidLog(reportDate, branchId, tenantId);
  }

  // Also for whoever closes the cash drawer (cashiers): the shift-close report is printed from it
  // Basic for every shop that sells or repairs (end-of-day slip, today's figures), not only with reports
  @RequireModule('report', 'pos', 'repair')
  @RequirePermission('reports.view', 'cash_drawer.close_session')
  @Get('daily-closing')
  async getDailyClosingReport(
    @Query('date') date: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role')     role?: string,
    @CurrentUser('branchId') userBranchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
    @CurrentUser() user?: { role?: string; permissions?: string[] },
  ) {
    const reportDate = date || bangkokDate();
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    const report = await this.reportsService.getDailyClosingReport(reportDate, effectiveBranchId, tenantId);
    const isOwner = role === 'OWNER' || role === 'SUPER_ADMIN';
    if (isOwner || (user?.permissions ?? []).includes('reports.view')) return report;
    // Someone closing the drawer without reports.view: the day's money of their branch, without
    // cost prices or the staff / product rankings
    const { performance: _rankings, ...rest } = report as any;
    return canViewCost(user) ? rest : stripCost(rest);
  }

  @RequirePermission('reports.view')
  @Get('profit')
  getProfitReport(
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('branchId') branchId?: string,
    @CurrentUser('role')     role?: string,
    @CurrentUser('branchId') userBranchId?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    const today = bangkokDate();
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN') ? branchId : (userBranchId ?? undefined);
    return this.reportsService.getProfitReport(startDate || today, endDate || today, effectiveBranchId, tenantId);
  }

  @RequirePermission('reports.view')
  @Get('supplier-aging')
  getSupplierAging(@CurrentUser('tenantId') tenantId?: string) {
    return this.reportsService.getSupplierAging(tenantId);
  }
}
