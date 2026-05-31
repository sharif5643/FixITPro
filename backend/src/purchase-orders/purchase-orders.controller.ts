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
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('purchase-orders')
export class PurchaseOrdersController {
  constructor(private poService: PurchaseOrdersService) {}

  @Get()
  findAll(
    @Query() query: { status?: string; supplierId?: string; search?: string },
  ) {
    return this.poService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.poService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreatePurchaseOrderDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.poService.create(dto, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseOrderDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.poService.update(id, dto, actorId);
  }

  @Post(':id/receive')
  receiveGoods(
    @Param('id') id: string,
    @Body() dto: ReceiveGoodsDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.poService.receiveGoods(id, dto, actorId);
  }

  @Get(':id/movements')
  getMovements(@Param('id') id: string) {
    return this.poService.getMovements(id);
  }

  @Post(':id/payments')
  createPayment(
    @Param('id') id: string,
    @Body() dto: CreatePaymentDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.poService.createPayment(id, dto, userId);
  }

  @Get(':id/payments')
  getPayments(@Param('id') id: string) {
    return this.poService.getPayments(id);
  }
}
