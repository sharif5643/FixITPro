import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PermissionsService } from './permissions.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '@prisma/client';

@UseGuards(JwtAuthGuard, TenantActiveGuard, RolesGuard)
@Roles('OWNER')
@Controller('permissions')
export class PermissionsController {
  constructor(private service: PermissionsService) {}

  @Get()
  getAll() {
    return this.service.getAllPermissions();
  }

  @Get('roles')
  getRolePermissions(@CurrentUser('tenantId') tenantId: string | null) {
    return this.service.getRolePermissions(tenantId);
  }

  @Put('roles/:role')
  setRolePermissions(
    @Param('role') role: Role,
    @Body() body: { permissions: string[] },
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.setRolePermissions(role, body.permissions ?? [], tenantId, actorId, actorName);
  }

  @Put('roles/:role/toggle')
  togglePermission(
    @Param('role') role: Role,
    @Body() body: { permission: string; enabled: boolean },
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.togglePermission(role, body.permission, body.enabled, tenantId, actorId, actorName);
  }

  @Post('roles/:role/apply-preset')
  applyPreset(
    @Param('role') role: Role,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.applyPreset(role, tenantId, actorId, actorName);
  }

  // ── Per-user grants ──────────────────────────────────────────────────────────

  @Get('users/:userId')
  getUserGrants(
    @Param('userId') userId: string,
    @CurrentUser('tenantId') callerTenantId: string | null,
    @CurrentUser('role') callerRole: string,
  ) {
    return this.service.getUserGrants(userId, callerTenantId, callerRole);
  }

  @Post('users/:userId')
  grantToUser(
    @Param('userId') userId: string,
    @Body() body: { permission: string },
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') callerTenantId: string | null,
    @CurrentUser('role') callerRole: string,
  ) {
    return this.service.grantToUser(userId, body.permission, actorId, actorName, callerTenantId, callerRole);
  }

  @Delete('users/:userId/:permission')
  revokeFromUser(
    @Param('userId') userId: string,
    @Param('permission') permission: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('tenantId') callerTenantId: string | null,
    @CurrentUser('role') callerRole: string,
  ) {
    return this.service.revokeFromUser(userId, permission, actorId, actorName, callerTenantId, callerRole);
  }
}
