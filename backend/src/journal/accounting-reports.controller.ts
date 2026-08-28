import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard }    from '../common/guards/jwt-auth.guard';
import { RolesGuard }      from '../common/guards/roles.guard';
import { Roles }           from '../common/decorators/roles.decorator';
import { CurrentUser }     from '../common/decorators/current-user.decorator';
import { AccountingReportsService } from './accounting-reports.service';

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
      startDate: startDate ? new Date(startDate) : undefined,
      endDate:   endDate   ? new Date(endDate)   : undefined,
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
      startDate: startDate ? new Date(startDate) : undefined,
      endDate:   endDate   ? new Date(endDate)   : undefined,
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
      endDate:  asOfDate ? new Date(asOfDate) : new Date(),
      branchId,
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
      startDate: startDate ? new Date(startDate) : undefined,
      endDate:   endDate   ? new Date(endDate)   : undefined,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }
}
