import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { DebtPaymentsService } from './debt-payments.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard, PermissionGuard)
@Controller('debt-payments')
export class DebtPaymentsController {
  constructor(private readonly service: DebtPaymentsService) {}

  @RequirePermission('repair.close')
  @Post()
  create(
    @Body()                  dto: CreateDebtPaymentDto,
    @CurrentUser('id')       userId:   string,
    @CurrentUser('name')     userName: string,
    @CurrentUser('branchId') branchId: string | null,
    @CurrentUser('role')     role: string,
  ) {
    return this.service.create(dto, userId, userName, branchId, role);
  }

  @Get('repair/:repairId')
  getByRepair(@Param('repairId') repairId: string) {
    return this.service.getByRepair(repairId);
  }
}
