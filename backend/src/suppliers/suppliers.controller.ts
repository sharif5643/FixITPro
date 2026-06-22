import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

function defaultMonthRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
  return { startDate: `${y}-${m}-01`, endDate: `${y}-${m}-${String(lastDay).padStart(2, '0')}` };
}

@RequireModule('finance')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}

  @Get()
  findAll(
    @Query() query: { search?: string; includeInactive?: string },
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.suppliersService.findAll({ ...query, tenantId });
  }

  @Get('payables/aging')
  getAgingReport(@CurrentUser('tenantId') tenantId: string) {
    return this.suppliersService.getAgingReport(tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.suppliersService.findOne(id, tenantId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('purchase.create')
  create(
    @Body() dto: CreateSupplierDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.suppliersService.create(dto, tenantId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('purchase.create')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSupplierDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.suppliersService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('purchase.create')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.suppliersService.remove(id, tenantId);
  }

  @Get(':id/statement')
  getStatement(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const range = defaultMonthRange();
    return this.suppliersService.getStatement(
      id,
      startDate || range.startDate,
      endDate   || range.endDate,
      tenantId,
    );
  }
}
