import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus, UseInterceptors } from '@nestjs/common';
import { SuperAdminAuditInterceptor } from '../super-admin-audit.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ActivateTenantDto } from './dto/activate-tenant.dto';
import { RenewTenantDto } from './dto/renew-tenant.dto';
import { TenantPlan } from '@prisma/client';

@Controller('super-admin/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@UseInterceptors(SuperAdminAuditInterceptor)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Get('stats')
  stats() {
    return this.tenantsService.stats();
  }

  @Get()
  findAll(@Query('filter') filter?: string) {
    return this.tenantsService.findAll(filter);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateTenantDto) {
    return this.tenantsService.create(dto);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @Body() dto: ActivateTenantDto) {
    return this.tenantsService.activate(id, dto);
  }

  @Patch(':id/renew')
  renew(@Param('id') id: string, @Body() dto: RenewTenantDto) {
    return this.tenantsService.renew(id, dto);
  }

  @Patch(':id/suspend')
  suspend(@Param('id') id: string) {
    return this.tenantsService.suspend(id);
  }

  @Patch(':id/reactivate')
  reactivate(@Param('id') id: string) {
    return this.tenantsService.reactivate(id);
  }

  @Patch(':id/change-plan')
  @HttpCode(HttpStatus.OK)
  changePlan(
    @Param('id') id: string,
    @Body() body: { plan: TenantPlan },
  ) {
    return this.tenantsService.changePlan(id, body.plan);
  }

  /** Whether a (trial) shop may be removed: only one with no sales and no repair jobs. */
  @Get(':id/delete-check')
  deleteCheck(@Param('id') id: string) {
    return this.tenantsService.deleteCheck(id);
  }

  @Post(':id/delete')
  @HttpCode(HttpStatus.OK)
  deleteTrialShop(
    @Param('id') id: string,
    @Body() body: { confirmName?: string },
    @CurrentUser() admin: { id?: string; name?: string },
  ) {
    return this.tenantsService.deleteTrialShop(id, body?.confirmName ?? '', admin);
  }

  @Post(':id/restore-deleted')
  @HttpCode(HttpStatus.OK)
  restoreDeleted(@Param('id') id: string, @CurrentUser() admin: { id?: string; name?: string }) {
    return this.tenantsService.restoreDeleted(id, admin);
  }

  @Post(':id/reset-owner-password')
  resetOwnerPassword(
    @Param('id') tenantId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.tenantsService.resetOwnerPassword(tenantId, adminId);
  }
}
