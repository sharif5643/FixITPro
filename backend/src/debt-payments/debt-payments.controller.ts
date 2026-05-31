import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { DebtPaymentsService } from './debt-payments.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('debt-payments')
export class DebtPaymentsController {
  constructor(private readonly service: DebtPaymentsService) {}

  @Post()
  create(
    @Body() dto: CreateDebtPaymentDto,
    @CurrentUser('id')   userId:   string,
    @CurrentUser('name') userName: string,
  ) {
    return this.service.create(dto, userId, userName);
  }

  @Get('repair/:repairId')
  getByRepair(@Param('repairId') repairId: string) {
    return this.service.getByRepair(repairId);
  }
}
