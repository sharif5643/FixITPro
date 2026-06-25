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
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateTagsDto } from './dto/update-tags.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  note: string;
}

@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard, ModuleGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @RequireModule('crm')
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
  getDebtSummary(@CurrentUser('tenantId') tenantId: string) {
    return this.customersService.getDebtSummary(tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.customersService.findOne(id, tenantId);
  }

  @RequireModule('crm')
  @RequirePermission('sales.create')
  @Put(':id')
  update(
    @Param('id')             id: string,
    @Body()                  dto: Partial<CreateCustomerDto>,
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
