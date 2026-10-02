import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryTypeDto } from './dto/create-category-type.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, TenantActiveGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  // ── Category Types (shared types + each tenant's own) ───────────

  @Post('types')
  createType(@Body() dto: CreateCategoryTypeDto, @CurrentUser('tenantId') tenantId: string | null) {
    return this.categoriesService.createType(dto, tenantId);
  }

  @Get('types')
  findAllTypes(@CurrentUser('tenantId') tenantId: string) {
    return this.categoriesService.findAllTypes(tenantId);
  }

  @Put('types/:id')
  updateType(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCategoryTypeDto>,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('role') role: string,
  ) {
    return this.categoriesService.updateType(id, dto, tenantId, role);
  }

  @Delete('types/:id')
  removeType(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('role') role: string,
  ) {
    return this.categoriesService.removeType(id, tenantId, role);
  }

  // ── Categories ──────────────────────────────────────────────────

  @Post()
  create(
    @Body() dto: CreateCategoryDto,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.categoriesService.create(dto, tenantId);
  }

  @Get()
  findAll(
    @CurrentUser('tenantId') tenantId: string,
    @Query('categoryTypeId') categoryTypeId?: string,
  ) {
    return this.categoriesService.findAll(tenantId, categoryTypeId);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCategoryDto>,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.categoriesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.categoriesService.remove(id, tenantId);
  }
}
