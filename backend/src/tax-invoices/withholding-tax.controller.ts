import { Idempotent } from '../common/interceptors/idempotency.interceptor';
import { Body, Controller, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsDateString, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { ModuleGuard } from '../common/guards/module.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { RequirePermission } from '../common/decorators/permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { WithholdingTaxService } from './withholding-tax.service';

function shop(tenantId: string | null): string {
  if (!tenantId) throw new ForbiddenException('ต้องเข้าใช้งานในนามร้าน');
  return tenantId;
}

export class RecordWithholdingTaxDto {
  @Type(() => Number) @IsNumber() @Min(0.01) @Max(10_000_000) amount: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) ratePercent: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100_000_000) baseAmount: number;
  @IsString() @MaxLength(200) payerName: string;
  @IsOptional() @IsString() @MaxLength(20) payerTaxId?: string;
  @IsOptional() @IsString() @MaxLength(50) certificateNo?: string;
  @IsOptional() @IsDateString() certificateDate?: string;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}

/** Withholding tax certificates (50 ทวิ) handed over by agencies and companies on repair bills */
@RequireModule('repair')
@UseGuards(JwtAuthGuard, TenantActiveGuard, ModuleGuard)
@Controller('withholding-tax')
export class WithholdingTaxController {
  constructor(private readonly service: WithholdingTaxService) {}

  @Get('report')
  @UseGuards(PermissionGuard)
  @RequirePermission('reports.view')
  report(@Query('year') year: string, @CurrentUser('tenantId') tenantId: string | null) {
    return this.service.yearReport(shop(tenantId), year);
  }

  @Get('repair/:repairId')
  forRepair(@Param('repairId') repairId: string, @CurrentUser('tenantId') tenantId: string | null) {
    return this.service.forRepair(repairId, shop(tenantId));
  }

  @Idempotent()   // a repeated tap / offline resend is recorded once
  @Post('repair/:repairId')
  record(
    @Param('repairId') repairId: string,
    @Body() dto: RecordWithholdingTaxDto,
    @CurrentUser('id') id: string, @CurrentUser('name') name: string, @CurrentUser('role') role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.record(repairId, dto, { id, name, role }, shop(tenantId));
  }

  @Post(':id/cancel')
  cancel(
    @Param('id') whtId: string, @Body('reason') reason: string,
    @CurrentUser('id') id: string, @CurrentUser('name') name: string, @CurrentUser('role') role: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.cancel(whtId, reason, { id, name, role }, shop(tenantId));
  }
}
