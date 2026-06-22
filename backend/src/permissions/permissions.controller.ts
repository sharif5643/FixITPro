import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
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
  getRolePermissions() {
    return this.service.getRolePermissions();
  }

  @Put('roles/:role')
  setRolePermissions(
    @Param('role') role: Role,
    @Body() body: { permissions: string[] },
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.service.setRolePermissions(role, body.permissions, actorId, actorName);
  }

  @Put('roles/:role/toggle')
  togglePermission(
    @Param('role') role: Role,
    @Body() body: { permission: string; enabled: boolean },
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.service.togglePermission(role, body.permission, body.enabled, actorId, actorName);
  }

  @Post('roles/:role/apply-preset')
  applyPreset(
    @Param('role') role: Role,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.service.applyPreset(role, actorId, actorName);
  }
}
