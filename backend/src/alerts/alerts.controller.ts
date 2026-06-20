import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Controller('alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly svc: AlertsService) {}

  /**
   * Returns operational alerts scoped to the requesting user's branch.
   * Staff see their own branch only; OWNER/SUPER_ADMIN see all (or a specific
   * branch when ?branchId= is supplied).
   */
  @Get('operational')
  getOperational(
    @CurrentUser('role')     actorRole: string,
    @CurrentUser('branchId') actorBranchId: string | null,
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('branchId')       queryBranchId?: string,
  ) {
    const isPrivileged = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    const effectiveBranchId = isPrivileged
      ? (queryBranchId ?? null)
      : (actorBranchId ?? null);
    return this.svc.getOperationalAlerts(effectiveBranchId, isPrivileged, tenantId);
  }
}
