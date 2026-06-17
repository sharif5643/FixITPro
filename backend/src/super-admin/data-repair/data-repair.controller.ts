import {
  Controller, Get, Post, Patch, Param, Query, Body,
  UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { JwtAuthGuard }     from '../../common/guards/jwt-auth.guard';
import { RolesGuard }       from '../../common/guards/roles.guard';
import { Roles }            from '../../common/decorators/roles.decorator';
import { CurrentUser }      from '../../common/decorators/current-user.decorator';
import { DataRepairService } from './data-repair.service';

@Controller('super-admin/data-repair')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class DataRepairController {
  constructor(private readonly svc: DataRepairService) {}

  // ── Summary counts ────────────────────────────────────────────────────────────

  @Get('summary')
  getSummary() {
    return this.svc.getSummary();
  }

  // ── Tenant options for dropdowns ──────────────────────────────────────────────

  @Get('tenants')
  getTenantOptions() {
    return this.svc.getTenantOptions();
  }

  // ── Orphan Branches ───────────────────────────────────────────────────────────

  @Get('orphan-branches')
  getOrphanBranches(
    @Query('page')   page?:   string,
    @Query('search') search?: string,
  ) {
    return this.svc.getOrphanBranches(page ? parseInt(page) : 1, search);
  }

  @Patch('branches/:id/assign-tenant')
  assignBranchToTenant(
    @Param('id')             branchId: string,
    @Body('tenantId')        tenantId: string,
    @CurrentUser('id')       actorId:  string,
    @CurrentUser('name')     actorName: string,
  ) {
    return this.svc.assignBranchToTenant(branchId, tenantId, actorId, actorName);
  }

  @Patch('branches/:id/move-tenant')
  moveBranchToTenant(
    @Param('id')             branchId:  string,
    @Body('tenantId')        toTenantId: string,
    @CurrentUser('id')       actorId:   string,
    @CurrentUser('name')     actorName: string,
  ) {
    return this.svc.moveBranchToTenant(branchId, toTenantId, actorId, actorName);
  }

  // ── All branches (with tenant info, for move UI) ──────────────────────────────

  @Get('all-branches')
  getAllBranches(
    @Query('page')     page?:     string,
    @Query('search')   search?:   string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.svc.getAllBranches(page ? parseInt(page) : 1, search, tenantId);
  }

  // ── Orphan ShopSettings ───────────────────────────────────────────────────────

  @Get('orphan-shop-settings')
  getOrphanShopSettings() {
    return this.svc.getOrphanShopSettings();
  }

  @Patch('shop-settings/:id/assign-tenant')
  assignShopSettingsToTenant(
    @Param('id', ParseIntPipe) settingsId: number,
    @Body('tenantId')          tenantId:   string,
    @CurrentUser('id')         actorId:    string,
    @CurrentUser('name')       actorName:  string,
  ) {
    return this.svc.assignShopSettingsToTenant(settingsId, tenantId, actorId, actorName);
  }

  // ── Orphan Notifications ──────────────────────────────────────────────────────

  @Post('assign-orphan-notifications')
  assignOrphanNotifications(
    @Body('tenantId')    tenantId:  string,
    @CurrentUser('id')   actorId:   string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.assignOrphanNotificationsToTenant(tenantId, actorId, actorName);
  }

  // ── Orphan Repairs (branchId = null) ─────────────────────────────────────────

  @Get('orphan-repairs')
  getOrphanRepairs() {
    return this.svc.getOrphanRepairs();
  }

  @Post('fix-orphan-repairs')
  fixOrphanRepairs(
    @CurrentUser('id')   actorId:   string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.fixOrphanRepairs(actorId, actorName);
  }
}
