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
import { SerialsService } from './serials.service';
import { CreateSerialDto } from './dto/create-serial.dto';
import { CreateBulkSerialDto } from './dto/create-bulk-serial.dto';
import { UpdateSerialDto } from './dto/update-serial.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('serials')
export class SerialsController {
  constructor(private service: SerialsService) {}

  @Get()
  findAll(
    @Query()
    query: { productId?: string; status?: string; search?: string; limit?: string; page?: string },
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.findAll(query, tenantId);
  }

  // Must be before /:id to avoid route conflict
  @Get('lookup')
  lookup(
    @Query('serial') serial: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.lookup(serial, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.findOne(id, tenantId);
  }

  @RequirePermission('serials.manage')
  @Post()
  create(
    @Body() dto: CreateSerialDto,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.create(dto, tenantId);
  }

  @RequirePermission('serials.manage')
  @Post('bulk')
  createBulk(
    @Body() dto: CreateBulkSerialDto,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.createBulk(dto, tenantId);
  }

  @RequirePermission('serials.manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSerialDto,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.update(id, dto, tenantId);
  }
}
