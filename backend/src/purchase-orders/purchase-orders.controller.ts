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
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-po.dto';
import { UpdatePurchaseOrderDto } from './dto/update-po.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@RequireModule('finance')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private poService: PurchaseOrdersService) {}

  @Get()
  findAll(
    @Query() query: { status?: string; supplierId?: string; search?: string },
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.findAll(query, tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.findOne(id, tenantId);
  }

  @Post()
  @UseGuards(PermissionGuard)
  @RequirePermission('purchase.create')
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.create(dto, userId, tenantId);
  }

  @Patch(':id')
  @UseGuards(PermissionGuard)
  @RequirePermission('purchase.create')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser('id') actorId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.update(id, dto, actorId, tenantId);
  }

  @Post(':id/receive')
  @UseGuards(PermissionGuard)
  @RequirePermission('purchase.receive')
  receiveGoods(
    @Param('id') id: string,
    @Body() dto: ReceiveGoodsDto,
    @CurrentUser('id')       actorId: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('branchId') jwtBranchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    // P0-2: non-owner staff always receive into their JWT branch
    if (role !== 'OWNER' && role !== 'SUPER_ADMIN' && jwtBranchId) {
      dto.branchId = jwtBranchId;
    }
    return this.poService.receiveGoods(id, dto, actorId, tenantId);
  }

  @Get(':id/movements')
  getMovements(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.getMovements(id, tenantId);
  }

  @Post(':id/payments')
  @UseGuards(PermissionGuard)
  @RequirePermission('supplier.pay')
  createPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.createPayment(id, dto, userId, tenantId);
  }

  @Get(':id/payments')
  getPayments(
    @Param('id') id: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.poService.getPayments(id, tenantId);
  }
}
