import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ActivateTenantDto } from './dto/activate-tenant.dto';
import { RenewTenantDto } from './dto/renew-tenant.dto';

@Controller('super-admin/tenants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
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

  @Post(':id/reset-owner-password')
  resetOwnerPassword(
    @Param('id') tenantId: string,
    @CurrentUser('id') adminId: string,
  ) {
    return this.tenantsService.resetOwnerPassword(tenantId, adminId);
  }
}
