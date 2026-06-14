import {
  Controller, Get, Post, Put, Delete,
  Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ModulesService } from './modules.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

// ── Authenticated user endpoint ───────────────────────────────────────────────

@Controller('modules')
@UseGuards(JwtAuthGuard)
export class ModulesController {
  constructor(private modulesService: ModulesService) {}

  @Get('enabled')
  getEnabled(@CurrentUser('tenantId') tenantId: string | null) {
    return this.modulesService.getEnabledModules(tenantId);
  }
}

// ── Super Admin endpoints ─────────────────────────────────────────────────────

@Controller('super-admin/modules')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class SAModulesController {
  constructor(private modulesService: ModulesService) {}

  // ── Package routes (declare before generic :key routes) ─────────────────────

  @Get('packages')
  getAllPackages() {
    return this.modulesService.getAllPackages();
  }

  @Get('packages/:key')
  getPackage(@Param('key') key: string) {
    return this.modulesService.getPackage(key);
  }

  @Put('packages/:key/modules')
  setPackageModules(
    @Param('key') key: string,
    @Body() body: { moduleKeys: string[] },
  ) {
    return this.modulesService.setPackageModules(key, body.moduleKeys);
  }

  @Put('packages/:key')
  updatePackage(
    @Param('key') key: string,
    @Body() body: {
      name?: string;
      description?: string;
      price?: number | null;
      isActive?: boolean;
      sortOrder?: number;
    },
  ) {
    return this.modulesService.updatePackageMeta(key, body);
  }

  // ── Tenant module override routes ───────────────────────────────────────────

  @Get('tenants/:id')
  getTenantModules(@Param('id') id: string) {
    return this.modulesService.getTenantModules(id);
  }

  @Put('tenants/:id/:moduleKey')
  setTenantOverride(
    @Param('id') tenantId: string,
    @Param('moduleKey') moduleKey: string,
    @Body() body: { enabled: boolean; expiresAt?: string },
  ) {
    return this.modulesService.setTenantModuleOverride(
      tenantId, moduleKey, body.enabled, body.expiresAt,
    );
  }

  @Delete('tenants/:id/:moduleKey')
  @HttpCode(HttpStatus.OK)
  removeTenantOverride(
    @Param('id') tenantId: string,
    @Param('moduleKey') moduleKey: string,
  ) {
    return this.modulesService.removeTenantModuleOverride(tenantId, moduleKey);
  }

  // ── AppModule CRUD (generic :key last to avoid shadowing named routes) ───────

  @Get()
  getAllModules() {
    return this.modulesService.getAllModules();
  }

  @Post()
  createModule(@Body() body: { key: string; name: string; description?: string }) {
    return this.modulesService.createModule(body.key, body.name, body.description);
  }

  @Put(':key')
  updateModule(
    @Param('key') key: string,
    @Body() body: { name?: string; description?: string; isActive?: boolean },
  ) {
    return this.modulesService.updateModule(key, body);
  }

  @Delete(':key')
  @HttpCode(HttpStatus.OK)
  deleteModule(@Param('key') key: string) {
    return this.modulesService.deleteModule(key);
  }
}
