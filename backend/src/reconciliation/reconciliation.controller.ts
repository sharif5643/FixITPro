import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ReconciliationService } from './reconciliation.service';
import { bkkDayEnd, bkkDayStart } from '../common/dates/bangkok';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
export class ReconciliationController {
  constructor(private readonly reconciliation: ReconciliationService) {}

  /**
   * GET /reconciliation/report?startDate=2026-01-01&endDate=2026-01-31
   * Requires: cash_drawer.view_balance permission (OWNER / MANAGER)
   */
  @Get('report')
  @RequirePermission('cash_drawer.view_balance')
  async report(
    @Query('startDate') startDateStr: string,
    @Query('endDate')   endDateStr:   string,
    @Request()          req:          any,
  ) {
    const user      = req.user as { branchId?: string; tenantId?: string };
    const branchId  = user.branchId ?? '';
    const tenantId  = user.tenantId ?? null;
    // Whole Bangkok days (the server runs in UTC: setHours would end the day at 07:00 Thai time)
    const startDate = startDateStr ? bkkDayStart(startDateStr) : new Date(Date.now() - 30 * 86400_000);
    const endDate   = endDateStr   ? bkkDayEnd(endDateStr)     : new Date();

    return this.reconciliation.runReport({ branchId, tenantId, startDate, endDate });
  }
}
