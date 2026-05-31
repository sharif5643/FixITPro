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

@UseGuards(JwtAuthGuard)
@Controller('serials')
export class SerialsController {
  constructor(private service: SerialsService) {}

  @Get()
  findAll(
    @Query()
    query: { productId?: string; status?: string; search?: string; limit?: string; page?: string },
  ) {
    return this.service.findAll(query);
  }

  // Must be before /:id to avoid route conflict
  @Get('lookup')
  lookup(@Query('serial') serial: string) {
    return this.service.lookup(serial);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateSerialDto) {
    return this.service.create(dto);
  }

  @Post('bulk')
  createBulk(@Body() dto: CreateBulkSerialDto) {
    return this.service.createBulk(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSerialDto) {
    return this.service.update(id, dto);
  }
}
