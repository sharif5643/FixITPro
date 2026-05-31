import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryTypeDto } from './dto/create-category-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  // ── Category Types ──────────────────────────────────────────────

  @Post('types')
  createType(@Body() dto: CreateCategoryTypeDto) {
    return this.categoriesService.createType(dto);
  }

  @Get('types')
  findAllTypes() {
    return this.categoriesService.findAllTypes();
  }

  @Put('types/:id')
  updateType(@Param('id') id: string, @Body() dto: Partial<CreateCategoryTypeDto>) {
    return this.categoriesService.updateType(id, dto);
  }

  @Delete('types/:id')
  removeType(@Param('id') id: string) {
    return this.categoriesService.removeType(id);
  }

  // ── Categories ──────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(dto);
  }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: Partial<CreateCategoryDto>) {
    return this.categoriesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.categoriesService.remove(id);
  }
}
