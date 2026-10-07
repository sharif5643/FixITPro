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
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';

// Anyone signed in reads categories; changing them is part of managing products.
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private categoriesService: CategoriesService) {}

  // ── Category Types (shared types + each tenant's own) ───────────

  @Post('types')
  @RequirePermission('products.create', 'products.edit')
  createType(@Body() dto: CreateCategoryTypeDto, @CurrentUser('tenantId') tenantId: string | null) {
    return this.categoriesService.createType(dto, tenantId);
  }

  @Get('types')
  findAllTypes(@CurrentUser('tenantId') tenantId: string) {
    return this.categoriesService.findAllTypes(tenantId);
  }

  @Put('types/:id')
  @RequirePermission('products.create', 'products.edit')
  updateType(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCategoryTypeDto>,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('role') role: string,
  ) {
    return this.categoriesService.updateType(id, dto, tenantId, role);
  }

  @Delete('types/:id')
  @RequirePermission('products.create', 'products.edit')
  removeType(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('role') role: string,
  ) {
    return this.categoriesService.removeType(id, tenantId, role);
  }

  // ── Categories ──────────────────────────────────────────────────

  @Post()
  @RequirePermission('products.create', 'products.edit')
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
  @RequirePermission('products.create', 'products.edit')
  update(
    @Param('id') id: string,
    @Body() dto: Partial<CreateCategoryDto>,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.categoriesService.update(id, dto, tenantId);
  }

  @Delete(':id')
  @RequirePermission('products.create', 'products.edit')
  remove(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.categoriesService.remove(id, tenantId);
  }
}
