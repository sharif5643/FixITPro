import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }    from '../common/guards/jwt-auth.guard';
import { RolesGuard }      from '../common/guards/roles.guard';
import { Roles }           from '../common/decorators/roles.decorator';
import { CurrentUser }     from '../common/decorators/current-user.decorator';
import { AccountingReportsService } from './accounting-reports.service';

/** A day picked on screen ("2026-11-05") is a Bangkok day: from its first to its last moment. */
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
export const dayStart = (s: string) => new Date(DATE_ONLY.test(s) ? `${s}T00:00:00.000+07:00` : s);
export const dayEnd   = (s: string) => new Date(DATE_ONLY.test(s) ? `${s}T23:59:59.999+07:00` : s);


@Controller('accounting/reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'SUPER_ADMIN')
export class AccountingReportsController {
  constructor(private readonly reports: AccountingReportsService) {}

  // ── GET /api/v1/accounting/reports/trial-balance ──────────────────────────

  @Get('trial-balance')
  trialBalance(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role')     role:            string,
    @Query('tenantId')  tenantIdParam?: string,
    @Query('startDate') startDate?:     string,
    @Query('endDate')   endDate?:       string,
    @Query('branchId')  branchId?:      string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.reports.trialBalance({
      tenantId,
      startDate: startDate ? dayStart(startDate) : undefined,
      endDate:   endDate ? dayEnd(endDate)   : undefined,
      branchId,
    });
  }

  // ── GET /api/v1/accounting/reports/income-statement ───────────────────────

  @Get('income-statement')
  incomeStatement(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role')     role:            string,
    @Query('tenantId')  tenantIdParam?: string,
    @Query('startDate') startDate?:     string,
    @Query('endDate')   endDate?:       string,
    @Query('branchId')  branchId?:      string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.reports.incomeStatement({
      tenantId,
      startDate: startDate ? dayStart(startDate) : undefined,
      endDate:   endDate ? dayEnd(endDate)   : undefined,
      branchId,
    });
  }

  // ── GET /api/v1/accounting/reports/balance-sheet ──────────────────────────

  @Get('balance-sheet')
  balanceSheet(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role')     role:            string,
    @Query('tenantId')  tenantIdParam?: string,
    @Query('asOfDate')  asOfDate?:      string,
    @Query('branchId')  branchId?:      string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.reports.balanceSheet({
      tenantId,
      endDate:  asOfDate ? dayEnd(asOfDate) : new Date(),
      branchId,
    });
  }

  // ── GET /api/v1/accounting/reports/cash-flow ──────────────────────────────

  @Get('cash-flow')
  cashFlow(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role')     role:            string,
    @Query('tenantId')  tenantIdParam?: string,
    @Query('startDate') startDate?:     string,
    @Query('endDate')   endDate?:       string,
    @Query('branchId')  branchId?:      string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.reports.cashFlow({
      tenantId,
      startDate: startDate ? dayStart(startDate) : undefined,
      endDate:   endDate ? dayEnd(endDate)   : undefined,
      branchId:  branchId  ?? undefined,
    });
  }

  // ── GET /api/v1/accounting/reports/monthly-trend ─────────────────────────

  @Get('monthly-trend')
  monthlyTrend(
    @CurrentUser('tenantId') callerTenantId: string,
    @CurrentUser('role')     role:            string,
    @Query('tenantId') tenantIdParam?: string,
    @Query('months')   months?:        string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.reports.monthlyTrend({
      tenantId,
      months: months ? parseInt(months, 10) : 12,
    });
  }

  // ── GET /api/v1/accounting/reports/ledger/:accountId ─────────────────────

  @Get('ledger/:accountId')
  generalLedger(
    @Param('accountId')      accountId:       string,
    @CurrentUser('tenantId') callerTenantId:  string,
    @CurrentUser('role')     role:             string,
    @Query('tenantId')  tenantIdParam?: string,
    @Query('startDate') startDate?:     string,
    @Query('endDate')   endDate?:       string,
    @Query('page')      page?:          string,
    @Query('limit')     limit?:         string,
  ) {
    const tenantId = role === 'SUPER_ADMIN' && tenantIdParam ? tenantIdParam : callerTenantId;
    return this.reports.generalLedger({
      tenantId,
      accountId,
      startDate: startDate ? dayStart(startDate) : undefined,
      endDate:   endDate ? dayEnd(endDate)   : undefined,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
