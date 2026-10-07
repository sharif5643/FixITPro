import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { TechniciansService } from './technicians.service';
import { canViewCost } from '../common/interceptors/hide-cost.interceptor';

type Viewer = { id: string; role?: string; permissions?: string[]; tenantId: string };

/** Owners and people who see reports compare every technician; a technician sees their own. */
const seesEveryone = (u: Viewer) => u.role === 'OWNER' || u.role === 'SUPER_ADMIN' || (u.permissions ?? []).includes('reports.view');

/** Parts cost and profit only for those who may see cost. */
function hideCost<T>(rows: T, u: Viewer): T {
  if (canViewCost(u)) return rows;
  for (const r of (Array.isArray(rows) ? rows : [rows]) as any[]) {
    if (r?.kpi) { delete r.kpi.partsCost; delete r.kpi.laborProfit; }
  }
  return rows;
}

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('technicians')
export class TechniciansController {
  constructor(private readonly svc: TechniciansService) {}

  @Get()
  @RequirePermission('technician.view')
  async findAll(
    @Query() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: Viewer,
  ) {
    const all = await this.svc.findAll(query, user.tenantId);
    return hideCost(seesEveryone(user) ? all : all.filter((t: any) => t.id === user.id), user);
  }

  /** Names only, for picking who does a repair. Front-desk staff who can take in repairs
   *  need this without the technician performance figures behind technician.view. */
  @Get('assignable')
  @RequirePermission('repair.create')
  assignable(@CurrentUser('tenantId') tenantId: string) {
    return this.svc.findAssignable(tenantId);
  }

  /** Technician pay for a period (owners / managers: it shows everyone's earnings). */
  @Get('commission')
  @RequirePermission('reports.view')
  commission(
    @Query() query: { startDate?: string; endDate?: string },
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.svc.getCommission(query, tenantId);
  }

  @Get('leaderboard')
  @RequirePermission('technician.view')
  async leaderboard(
    @Query() query: { startDate?: string; endDate?: string; limit?: string },
    @CurrentUser() user: Viewer,
  ) {
    const board = await this.svc.getLeaderboard(query, user.tenantId);
    return hideCost(seesEveryone(user) ? board : board.filter((t: any) => t.id === user.id), user);
  }

  @Get(':id')
  @RequirePermission('technician.view')
  async findOne(
    @Param('id') id: string,
    @Query() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: Viewer,
  ) {
    if (!seesEveryone(user) && id !== user.id) throw new ForbiddenException('ดูได้เฉพาะข้อมูลของตัวเอง');
    const one = await this.svc.findOne(id, query, user.tenantId);
    if (!one) throw new NotFoundException('ไม่พบช่าง');
    return hideCost(one, user);
  }

  @Get(':id/daily')
  @RequirePermission('technician.view')
  getDailyData(
    @Param('id') id: string,
    @Query() query: { startDate?: string; endDate?: string },
    @CurrentUser() user: Viewer,
  ) {
    if (!seesEveryone(user) && id !== user.id) throw new ForbiddenException('ดูได้เฉพาะข้อมูลของตัวเอง');
    return this.svc.getDailyData(id, query.startDate, query.endDate, user.tenantId);
  }
}
