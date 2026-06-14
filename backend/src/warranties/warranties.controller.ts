import {
  Controller, Get, Post, Patch, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WarrantiesService } from './warranties.service';

class CreateRepairWarrantyDto {
  repairId!:      string;
  warrantyDays!:  number;
  description?:   string;
}

class CreateProductWarrantyDto {
  saleItemId!:      string;
  warrantyDays!:    number;
  serialNumberId?:  string;
  description?:     string;
}

class UpdateWarrantyDto {
  notes?:       string;
  endDate?:     string;
  description?: string;
}

class VoidWarrantyDto {
  reason!: string;
}

@RequireModule('repair')
@UseGuards(JwtAuthGuard, PermissionGuard, ModuleGuard)
@Controller('warranties')
export class WarrantiesController {
  constructor(private readonly svc: WarrantiesService) {}

  @Get()
  @RequirePermission('warranty.view')
  findAll(@Query() query: any) {
    return this.svc.findAll(query);
  }

  @Get('stats')
  @RequirePermission('warranty.view')
  getStats() {
    return this.svc.getStats();
  }

  @Get(':id')
  @RequirePermission('warranty.view')
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Post('repair')
  @RequirePermission('warranty.manage')
  createForRepair(
    @Body() dto: CreateRepairWarrantyDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.createForRepair(dto.repairId, dto.warrantyDays, dto.description, actorId, actorName);
  }

  @Post('product')
  @RequirePermission('warranty.manage')
  createForProduct(
    @Body() dto: CreateProductWarrantyDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.createForSaleItem(dto.saleItemId, dto.warrantyDays, dto.serialNumberId, dto.description, actorId, actorName);
  }

  @Patch(':id')
  @RequirePermission('warranty.manage')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateWarrantyDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.update(id, dto, actorId, actorName);
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('warranty.manage')
  void(
    @Param('id') id: string,
    @Body() dto: VoidWarrantyDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.void(id, dto.reason, actorId, actorName);
  }

  @Post(':id/claim')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('warranty.manage')
  markClaimed(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.svc.markClaimed(id, actorId, actorName);
  }
}
