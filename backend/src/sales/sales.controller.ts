import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SalesService } from './sales.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { VoidSaleDto } from './dto/void-sale.dto';
import { RefundSaleDto } from './dto/refund-sale.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.create')
  create(
    @Body() dto: CreateSaleDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('branchId') branchId: string | null,
  ) {
    return this.salesService.create(dto, userId, branchId ?? undefined);
  }

  @Get()
  findAll(
    @Query() query: { date?: string; customerId?: string; shiftId?: string; branchId?: string },
    @CurrentUser('role') role: string,
    @CurrentUser('branchId') userBranchId: string | null,
  ) {
    const effectiveBranchId = (role === 'OWNER' || role === 'SUPER_ADMIN')
      ? query.branchId
      : (userBranchId ?? undefined);
    return this.salesService.findAll({ ...query, branchId: effectiveBranchId });
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.salesService.findOne(id);
  }

  @Post(':id/void')
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.refund')
  voidSale(
    @Param('id') id: string,
    @Body() dto: VoidSaleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.salesService.voidSale(id, dto.reason, userId);
  }

  @Post(':id/refund')
  @UseGuards(PermissionGuard)
  @RequirePermission('sales.refund')
  refundSale(
    @Param('id') id: string,
    @Body() dto: RefundSaleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.salesService.refundSaleItems(id, dto, userId);
  }
}
