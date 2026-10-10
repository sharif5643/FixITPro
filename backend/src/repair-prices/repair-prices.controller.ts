import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { canViewCost } from '../common/interceptors/hide-cost.interceptor';
import { RepairPricesService } from './repair-prices.service';
import { RepairPriceRowDto, UpsertRepairPricesDto } from './dto/repair-price.dto';

type Viewer = { tenantId?: string | null; role?: string; permissions?: string[] };

function shopOf(user: Viewer): string {
  if (!user?.tenantId) throw new ForbiddenException('ใช้ได้เฉพาะบัญชีของร้าน');
  return user.tenantId;
}

/** Anyone who takes in repairs reads the price list; the owner (settings.manage) sets it. */
@RequireModule('repair')
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard, ModuleGuard)
@Controller('repair-prices')
export class RepairPricesController {
  constructor(private readonly svc: RepairPricesService) {}

  @Get()
  @RequirePermission('repair.create')
  list(@CurrentUser() user: Viewer, @Query('search') search?: string) {
    return this.svc.list(shopOf(user), canViewCost(user), search);
  }

  @Get('lookup')
  @RequirePermission('repair.create')
  lookup(@CurrentUser() user: Viewer, @Query('brand') brand = '', @Query('model') model = '') {
    return this.svc.lookup(shopOf(user), brand, model, canViewCost(user));
  }

  @Get('devices')
  @RequirePermission('repair.create')
  devices(@CurrentUser() user: Viewer) {
    return this.svc.devices(shopOf(user));
  }

  @Post()
  @RequirePermission('settings.manage')
  upsert(@CurrentUser() user: Viewer, @Body() dto: UpsertRepairPricesDto) {
    return this.svc.upsertMany(shopOf(user), dto.rows);
  }

  @Patch(':id')
  @RequirePermission('settings.manage')
  update(@CurrentUser() user: Viewer, @Param('id') id: string, @Body() dto: RepairPriceRowDto) {
    return this.svc.update(shopOf(user), id, dto);
  }

  @Delete(':id')
  @RequirePermission('settings.manage')
  remove(@CurrentUser() user: Viewer, @Param('id') id: string) {
    return this.svc.remove(shopOf(user), id);
  }
}
