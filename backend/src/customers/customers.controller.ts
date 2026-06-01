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
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { IsString, IsNotEmpty } from 'class-validator';

class AddNoteDto {
  @IsString()
  @IsNotEmpty()
  note: string;
}

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @RequirePermission('sales.create')
  @Post()
  create(
    @Body()              dto: CreateCustomerDto,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.customersService.create(dto, actorId, actorName);
  }

  @Get()
  findAll(@Query() query: { search?: string }) {
    return this.customersService.findAll(query);
  }

  @Get('debt-summary')
  getDebtSummary() {
    return this.customersService.getDebtSummary();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @RequirePermission('sales.create')
  @Put(':id')
  update(
    @Param('id')         id: string,
    @Body()              dto: Partial<CreateCustomerDto>,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.customersService.update(id, dto, actorId, actorName);
  }

  @Patch(':id/tags')
  updateTags(
    @Param('id') id: string,
    @Body()      dto: UpdateTagsDto,
  ) {
    return this.customersService.updateTags(id, dto.tags);
  }

  @Get(':id/notes')
  getNotes(@Param('id') id: string) {
    return this.customersService.getNotes(id);
  }

  @Post(':id/notes')
  addNote(
    @Param('id')         customerId: string,
    @Body()              dto: AddNoteDto,
    @CurrentUser('id')   actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.customersService.addNote(
      customerId, dto.note, actorId, actorName,
    );
  }
}
