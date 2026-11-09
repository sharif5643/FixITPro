import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { IsNumber, IsOptional, Min, Max, IsIn, MaxLength, IsString, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

class AdjustPointsDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-100000)
  @Max(100000)
  points: number;

  // Without validation rules these were rejected ("property type should not exist"): adjusting
  // points from the customer page always failed
  @IsString()
  @IsIn(['EARN_MANUAL', 'EARN_REPAIR', 'EARN_SALE', 'REDEEM', 'ADJUST', 'EXPIRE'])
  type: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class MergeCustomerDto {
  @IsString()
  @IsNotEmpty()
  fromId: string;
}

class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  note: string;
}

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard, ModuleGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  // The till and repair intake add / fix a customer too, without the customer pages
  @RequireModule('crm', 'pos', 'repair')
  @RequirePermission('sales.create')
  @Post()
  create(
    @Body()              dto: CreateCustomerDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.create(dto, actorId, actorName, tenantId);
  }

  @Get()
  findAll(
    @Query() query: { search?: string },
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.findAll({ ...query, tenantId });
  }

  @Get('debt-summary')
  @RequirePermission('repair.close', 'reports.view')
  getDebtSummary(@CurrentUser('tenantId') tenantId: string) {
    return this.customersService.getDebtSummary(tenantId);
  }

  /** What merging another (duplicate) customer into this one would move */
  @Get(':id/merge-preview')
  @RequirePermission('sales.create')
  mergePreview(
    @Param('id') id: string,
    @Query('fromId') fromId: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.mergePreview(id, fromId, tenantId);
  }

  /** Merge a duplicate customer into this one (owner only) */
  @Post(':id/merge')
  merge(
    @Param('id') id: string,
    @Body() body: MergeCustomerDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
    @CurrentUser('role') role: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    if (role !== 'OWNER') throw new ForbiddenException('เฉพาะเจ้าของร้านรวมลูกค้าได้');
    return this.customersService.merge(id, body.fromId, { id: actorId, name: actorName }, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.findOne(id, tenantId);
  }

  // The till and repair intake add / fix a customer too, without the customer pages
  @RequireModule('crm', 'pos', 'repair')
  @RequirePermission('sales.create')
  @Put(':id')
  update(
    @Param('id')             id: string,
    @Body()                  dto: UpdateCustomerDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.update(id, dto, actorId, actorName, tenantId);
  }

  @Patch(':id/tags')
  updateTags(
    @Param('id')             id: string,
    @Body()                  dto: UpdateTagsDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.updateTags(id, dto.tags, tenantId);
  }

  @Get(':id/notes')
  getNotes(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.getNotes(id, tenantId);
  }

  @Get(':id/loyalty')
  getLoyalty(
    @Param('id')             id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.getLoyalty(id, tenantId);
  }

  @RequirePermission('sales.create')
  @Post(':id/loyalty/adjust')
  async adjustPoints(
    @Param('id')             id: string,
    @Body()                  dto: AdjustPointsDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    try {
      return await this.customersService.adjustPoints(
        id, dto.points, dto.type, dto.note,
        actorId, actorName, tenantId,
      );
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }
  }

  @Post(':id/notes')
  addNote(
    @Param('id')             customerId: string,
    @Body()                  dto: AddNoteDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.addNote(
      customerId, dto.note, actorId, actorName, tenantId,
    );
  }
}
