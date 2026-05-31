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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  create(
    @Body() dto: CreateProductDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     userRole: string,
  ) {
    return this.productsService.create(dto, actorId, actorName, userBranchId, userRole);
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
  ) {
    // Non-OWNER users can only see their own branch stock — ignore any query param
    const effectiveBranchId =
      role !== 'OWNER' && role !== 'SUPER_ADMIN'
        ? (userBranchId ?? undefined)
        : (query.branchId ?? undefined);

    return this.productsService.findAll({ ...query, branchId: effectiveBranchId, role });
  }

  @Get('generate-sku')
  generateSku(@Query('type') type: string) {
    return this.productsService.generateSku(type ?? 'PHONE');
  }

  @Get('generate-barcode')
  generateBarcode() {
    return this.productsService.generateBarcode();
  }

  @Get('catalog/search')
  catalogSearch(
    @Query('search') search?: string,
    @Query('barcode') barcode?: string,
  ) {
    return this.productsService.catalogSearch(search, barcode);
  }

  @Get('barcode/:barcode')
  findByBarcode(@Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(barcode);
  }

  @Get(':id/availability')
  getAvailability(@Param('id') id: string) {
    return this.productsService.getAvailability(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Post(':id/enroll-branch')
  enrollBranch(
    @Param('id')             id: string,
    @Body()                  dto: EnrollBranchDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('name')     actorName: string,
    @CurrentUser('branchId') userBranchId: string | null,
    @CurrentUser('role')     userRole: string,
  ) {
    return this.productsService.enrollBranch(id, dto, actorId, actorName, userBranchId, userRole);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.productsService.update(id, dto, actorId, actorName);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser('id') actorId: string,
    @CurrentUser('name') actorName: string,
  ) {
    return this.productsService.remove(id, actorId, actorName);
  }
}
