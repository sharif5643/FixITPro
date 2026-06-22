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
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { EnrollBranchDto } from './dto/enroll-branch.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@RequireModule('stock')
@UseGuards(JwtAuthGuard, ModuleGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('products.create')
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     userRole: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.create(dto, actorId, actorName, userBranchId, userRole, tenantId);
  }

  @Get()
  findAll(
    @Query()
    query: {
      search?: string;
      type?: string;
      categoryId?: string;
      lowStock?: string;
      branchId?: string;
    },
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     role: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    const effectiveBranchId =
      role !== 'OWNER' && role !== 'SUPER_ADMIN'
        ? (userBranchId ?? undefined)
        : (query.branchId ?? undefined);

    return this.productsService.findAll({ ...query, branchId: effectiveBranchId, role, tenantId });
  }

  @Get('generate-sku')
  generateSku(
    @Query('type') type: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.generateSku(type ?? 'PHONE', tenantId);
  }

  @Get('generate-barcode')
  generateBarcode() {
    return this.productsService.generateBarcode();
  }

  @Get('catalog/search')
  catalogSearch(
    @Query('search') search?: string,
    @Query('barcode') barcode?: string,
    @CurrentUser('tenantId') tenantId?: string,
  ) {
    return this.productsService.catalogSearch(search, barcode, tenantId);
  }

  @Get('barcode/:barcode')
  findByBarcode(
    @Param('barcode') barcode: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.findByBarcode(barcode, undefined, tenantId);
  }

  @Get(':id/availability')
  getAvailability(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.getAvailability(id, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.findOne(id, undefined, tenantId);
  }

  @Post(':id/enroll-branch')
  @UseGuards(PermissionGuard)
  @RequirePermission('products.edit')
  enrollBranch(
    @Param('id')             id: string,
    @Body()                  dto: EnrollBranchDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     userRole: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.enrollBranch(id, dto, actorId, actorName, userBranchId, userRole, tenantId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('products.edit')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.update(id, dto, actorId, actorName, tenantId);
  }

  @Delete(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('products.delete')
  remove(
    @Param('id') id: string,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('tenantId') tenantId: string,
  ) {
    return this.productsService.remove(id, actorId, actorName, tenantId);
  }
}
