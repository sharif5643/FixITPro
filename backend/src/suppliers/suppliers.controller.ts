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
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';

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
  findAll(@Query() query: { search?: string; includeInactive?: string }) {
    return this.suppliersService.findAll(query);
  }

  @Get('payables/aging')
  getAgingReport() {
    return this.suppliersService.getAgingReport();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.suppliersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSupplierDto) {
    return this.suppliersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.suppliersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.suppliersService.remove(id);
  }

  @Get(':id/statement')
  getStatement(
    @Param('id') id: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const range = defaultMonthRange();
    return this.suppliersService.getStatement(
      id,
      startDate || range.startDate,
      endDate   || range.endDate,
    );
  }
}
