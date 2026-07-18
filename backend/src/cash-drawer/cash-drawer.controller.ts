import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { JwtAuthGuard }       from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard }  from '../common/guards/tenant-active.guard';
import { PermissionGuard }    from '../common/guards/permission.guard';
import { RequirePermission }  from '../common/decorators/permission.decorator';
import { CurrentUser }        from '../common/decorators/current-user.decorator';
import { CashDrawerService }  from './cash-drawer.service';
import { OpenSessionDto }     from './dto/open-session.dto';
import { CloseSessionDto }    from './dto/close-session.dto';
import { WithdrawDto }        from './dto/withdraw.dto';
import { DepositDto }         from './dto/deposit.dto';
import { ApproveDifferenceDto } from './dto/approve-difference.dto';

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('cash-drawer')
export class CashDrawerController {
  constructor(private readonly service: CashDrawerService) {}

  // ── Cash Drawers ──────────────────────────────────────────────────────────

  @Get('drawers')
  @RequirePermission('cash_drawer.view_balance')
  getDrawers(
    @CurrentUser('branchId') branchId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.getDrawers(branchId, tenantId);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  @Get('session/current')
  @RequirePermission('cash_drawer.view_balance')
  getCurrentSession(
    @CurrentUser('branchId') branchId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.getCurrentSession(branchId, tenantId);
  }

  @Get('session/history')
  @RequirePermission('cash_drawer.view_balance')
  getSessionHistory(
    @CurrentUser('branchId') branchId: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('drawerId') drawerId?: string,
  ) {
    return this.service.getSessionHistory(branchId, tenantId, { page, limit, drawerId });
  }

  @Get('session/:id')
  @RequirePermission('cash_drawer.view_balance')
  getSession(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.getSessionById(id, tenantId);
  }

  @Post('session/open')
  @RequirePermission('cash_drawer.open_session')
  openSession(
    @Body() dto: OpenSessionDto,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    return this.service.openSession(dto, actor);
  }

  @Post('session/:id/join')
  @RequirePermission('cash_drawer.join_session')
  joinSession(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    return this.service.joinSession(id, actor);
  }

  @Post('session/:id/leave')
  leaveSession(
    @Param('id') id: string,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null },
  ) {
    return this.service.leaveSession(id, actor);
  }

  @Post('session/:id/withdraw')
  @RequirePermission('cash_drawer.withdraw')
  withdraw(
    @Param('id') id: string,
    @Body() dto: WithdrawDto,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    return this.service.withdraw(id, dto, actor);
  }

  @Post('session/:id/deposit')
  @RequirePermission('cash_drawer.deposit')
  deposit(
    @Param('id') id: string,
    @Body() dto: DepositDto,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    return this.service.deposit(id, dto, actor);
  }

  @Post('session/:id/close')
  @RequirePermission('cash_drawer.close_session')
  closeSession(
    @Param('id') id: string,
    @Body() dto: CloseSessionDto,
    @CurrentUser() actor: {
      id: string; name: string;
      tenantId: string | null; branchId: string | null;
      permissions: string[];
    },
  ) {
    return this.service.closeSession(id, dto, actor);
  }

  @Post('session/:id/approve-difference')
  @RequirePermission('cash_drawer.approve_difference')
  approveDifference(
    @Param('id') id: string,
    @Body() dto: ApproveDifferenceDto,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null },
  ) {
    return this.service.approveDifference(id, dto, actor);
  }

  @Post('transaction/:txId/reverse')
  @RequirePermission('cash_drawer.approve_difference')
  reverseTransaction(
    @Param('txId') txId: string,
    @Body('reason') reason: string,
    @CurrentUser() actor: { id: string; name: string; tenantId: string | null; branchId: string | null },
  ) {
    return this.service.reverseTransaction(txId, reason, actor);
  }
}
