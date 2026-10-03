import {
  Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Req, UseInterceptors } from '@nestjs/common';
import { SuperAdminAuditInterceptor } from '../super-admin-audit.interceptor';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { VerifyPaymentDto } from './dto/verify-payment.dto';
import { RejectPaymentDto } from './dto/reject-payment.dto';

@Controller('super-admin/payments')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@UseInterceptors(SuperAdminAuditInterceptor)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('stats')
  stats() {
    return this.paymentsService.stats();
  }

  @Get()
  findAll(
    @Query('filter') filter?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.paymentsService.findAll(filter, tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.create(dto);
  }

  @Patch(':id/verify')
  verify(@Param('id') id: string, @Body() dto: VerifyPaymentDto, @Req() req: any) {
    return this.paymentsService.verify(id, dto, req.user.id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectPaymentDto, @Req() req: any) {
    return this.paymentsService.reject(id, dto, req.user.id);
  }

  @Patch(':id/activate')
  activate(@Param('id') id: string, @Req() req: any) {
    return this.paymentsService.activate(id, req.user.id);
  }
}
