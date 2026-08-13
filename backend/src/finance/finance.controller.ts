import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('finance')
export class FinanceController {
  constructor(private financeService: FinanceService) {}

  @Get('summary')
  @RequirePermission('reports.view')
  getSummary(
    @Query('startDate') startDate: string,
    @Query('endDate')   endDate:   string,
    @Query('branchId')  queryBranchId: string | undefined,
    @CurrentUser('role')     role:     string,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @CurrentUser('tenantId') tenantId:    string | null,
  ) {
    const branchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? queryBranchId
      : (jwtBranchId ?? undefined);
    const today = new Date().toISOString().slice(0, 10);
    return this.financeService.getSummary({
      startDate: startDate ?? today,
      endDate:   endDate   ?? today,
      branchId,
      tenantId,
    });
  }

  @Get('branch-pnl')
  @RequirePermission('reports.view')
  getBranchPnL(
    @Query('startDate') startDate: string,
    @Query('endDate')   endDate:   string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    return this.financeService.getBranchPnL({
      startDate: startDate ?? today,
      endDate:   endDate   ?? today,
      tenantId,
    });
  }

  @Get('transactions')
  @RequirePermission('reports.view')
  getTransactions(
    @Query('startDate')  startDate:  string | undefined,
    @Query('endDate')    endDate:    string | undefined,
    @Query('sourceType') sourceType: string | undefined,
    @Query('direction')  direction:  string | undefined,
    @Query('page')       page:       string | undefined,
    @Query('limit')      limit:      string | undefined,
    @Query('branchId')   queryBranchId: string | undefined,
    @CurrentUser('role')     role:     string,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @CurrentUser('tenantId') tenantId:    string | null,
  ) {
    const branchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? queryBranchId
      : (jwtBranchId ?? undefined);
    return this.financeService.getTransactions({
      startDate,
      endDate,
      branchId,
      tenantId,
      sourceType,
      direction,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
