import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Logger,
} from '@nestjs/common';
import { ShiftsService } from './shifts.service';
import { OpenShiftDto } from './dto/open-shift.dto';
import { CloseShiftDto } from './dto/close-shift.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { canSeeSimProfit } from '../carrier-wallet/hide-sim-profit';

/**
 * SIM / package profit is for people who see reports (owners, managers); the cashier closing
 * the shift sees the amounts, not the profit.
 */
function hideProfit<T>(result: T, user: { role?: string; permissions?: string[] }): T {
  if (!result || canSeeSimProfit(user)) {
    return result;
  }
  const r = result as any;
  if (r.summary?.packageSales) delete r.summary.packageSales.totalProfit;
  if ('packageSaleRevenue' in r) delete r.packageSaleRevenue; // the live shift's SIM profit
  for (const c of r.packageSalesByCarrier ?? r.summary?.packageSales?.byCarrier ?? []) delete c.profit;
  return result;
}

@UseGuards(JwtAuthGuard, TenantActiveGuard)
@Controller('shifts')
export class ShiftsController {
  private readonly logger = new Logger(ShiftsController.name);

  constructor(private shiftsService: ShiftsService) {}

  @Post('open')
  async openShift(
    @Body() dto: OpenShiftDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    this.logger.log(`openShift userId=${userId} branchId=${branchId ?? 'null'} openBalance=${dto.openBalance}`);
    try {
      return await this.shiftsService.openShift(dto, userId, branchId ?? undefined, tenantId ?? undefined);
    } catch (err) {
      this.logger.error(`openShift failed userId=${userId} branchId=${branchId ?? 'null'}: ${err?.message}`, err?.stack);
      throw err;
    }
  }

  @Post(':id/close')
  closeShift(
    @Param('id') id: string,
    @Body() dto: CloseShiftDto,
    @CurrentUser() user: { id: string; role?: string; branchId?: string | null; tenantId?: string | null },
  ) {
    return this.shiftsService.closeShift(id, dto, user.id, user).then((r) => hideProfit(r, user));
  }

  /** Open shifts of my branch I can join (one cash drawer, several people). */
  @Get('joinable')
  listJoinable(@CurrentUser() user: { id: string; branchId?: string | null; tenantId?: string | null }) {
    return this.shiftsService.listJoinable(user);
  }

  @Post(':id/join')
  joinShift(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; name?: string; branchId?: string | null; tenantId?: string | null },
  ) {
    return this.shiftsService.joinShift(id, user);
  }

  @Post('leave')
  leaveShift(@CurrentUser() user: { id: string; name?: string }) {
    return this.shiftsService.leaveShift(user);
  }

  /** A shift someone handed to me when they left early, waiting for me to take it over. */
  @Get('handover')
  pendingHandover(@CurrentUser('id') userId: string) {
    return this.shiftsService.pendingHandover(userId);
  }

  @Get('current')
  getCurrentShift(@CurrentUser() user: { id: string; role?: string; permissions?: string[] }) {
    return this.shiftsService.getCurrentShift(user.id).then((r) => hideProfit(r, user));
  }

  /** Every money movement of a shift with who did it (people in the shift, owner, branch manager). */
  @Get(':id/ledger')
  getShiftLedger(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] },
  ) {
    return this.shiftsService.getShiftLedger(id, user);
  }

  /** A closed shift's summary, to print it again (own shift; owners / managers any). */
  @Get(':id/summary')
  getClosedShiftSummary(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string; branchId?: string | null; tenantId?: string | null; permissions?: string[] },
  ) {
    return this.shiftsService.getClosedShiftSummary(id, user).then((r) => hideProfit(r, user));
  }

  @Get()
  findAll(
    @Query() query: { date?: string; userId?: string; branchId?: string },
    @CurrentUser('role')     role: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    return this.shiftsService.findAll({ ...query, branchId: effectiveBranchId, tenantId });
  }
}
