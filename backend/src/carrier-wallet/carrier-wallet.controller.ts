import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Param,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Min, Max, MaxLength, ValidateNested, ArrayMaxSize, ArrayMinSize, IsArray } from 'class-validator';
import { Type } from 'class-transformer';
import { CarrierWalletService } from './carrier-wallet.service';
import { PackageSaleDto, CarrierEnum, PayPackageDebtDto } from './dto/package-sale.dto';
import { TopupDto } from './dto/topup.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleGuard } from '../common/guards/module.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PermissionGuard } from '../common/guards/permission.guard';
import { RequirePermission } from '../common/decorators/permission.decorator';

class ReconcileEntryDto {
  @IsEnum(CarrierEnum)
  carrier: CarrierEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(9_999_999)
  actualBalance: number;

  @IsOptional()
  @IsString()
  note?: string;
}

class ReconcileDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => ReconcileEntryDto)
  entries: ReconcileEntryDto[];

  @IsOptional()
  @IsString()
  shiftId?: string;
}

class AdjustBalanceDto {
  @IsEnum(CarrierEnum)
  carrier: CarrierEnum;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(9_999_999)
  newBalance: number;

  @IsString()
  @MaxLength(200)
  reason: string;
}

class SimSaleDto {
  @IsEnum(CarrierEnum)
  carrier: CarrierEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100_000)
  packageAmount: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  costPrice: number;

  @IsString()
  paymentMethod: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  amountPaid: number;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsString()
  cashierName: string;

  @IsOptional() @IsBoolean()                 payLater?: boolean;
  @IsOptional() @IsString() @MaxLength(100)  debtorName?: string;
  @IsOptional() @IsString() @MaxLength(20)   debtorPhone?: string;
}

// Selling SIMs / packages and topping up a carrier wallet is front-desk work (sales.create);
// closing the shift count is cash-drawer work. Technicians and stock staff do neither.
@UseGuards(JwtAuthGuard, TenantActiveGuard, PermissionGuard)
@Controller('carrier-wallet')
export class CarrierWalletController {
  constructor(private readonly service: CarrierWalletService) {}

  @Get('balances')
  @RequirePermission('sales.create', 'reports.view')
  getBalances(@CurrentUser('tenantId') tenantId: string | null) {
    return this.service.getBalances(tenantId);
  }

  @Post('package-sale')
  @RequirePermission('sales.create')
  createPackageSale(
    @Body() dto: PackageSaleDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.createPackageSale(dto, userId, tenantId);
  }

  @Post('topup')
  @RequirePermission('sales.create')
  topup(
    @Body() dto: TopupDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.topup(dto, userId, tenantId);
  }

  @Get('movements')
  @RequirePermission('sales.create', 'reports.view')
  getMovements(
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('carrier') carrier?: string,
    @Query('date')    date?: string,
  ) {
    return this.service.getMovements(tenantId, carrier, date);
  }

  @Get('package-sales')
  @RequirePermission('sales.create', 'reports.view')
  getPackageSales(
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('date')    date?: string,
    @Query('carrier') carrier?: string,
  ) {
    return this.service.getPackageSales(tenantId, date, carrier);
  }

  @Post('sim-sale')
  @RequirePermission('sales.create')
  createSimSale(
    @Body() dto: SimSaleDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.createSimSale(dto, userId, tenantId);
  }

  // ── Pay later ("ค้างจ่าย") ─────────────────────────────────────────────────
  // Anyone who can sell SIMs/packages can sell on credit and take the money later.

  /** Unpaid (default) or all credit sales of this shop. */
  @Get('debts')
  @RequirePermission('sales.create', 'reports.view')
  listDebts(
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('status') status?: 'open' | 'settled' | 'all',
    @Query('q') q?: string,
  ) {
    return this.service.listDebts(tenantId, status ?? 'open', q);
  }

  /** Whether this phone number still owes for an earlier sale (checked before a new credit sale). */
  @Get('debts/check')
  @RequirePermission('sales.create')
  checkDebtor(@CurrentUser('tenantId') tenantId: string | null, @Query('phone') phone: string) {
    return this.service.openDebtFor(tenantId, phone);
  }

  @Post('debts/:saleId/pay')
  @RequirePermission('sales.create')
  payDebt(
    @Param('saleId') saleId: string,
    @Body() dto: PayPackageDebtDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.payDebt(saleId, dto, userId, tenantId);
  }

  @Post('reconcile')
  @RequirePermission('cash_drawer.close_session')
  @UseGuards(ModuleGuard)
  @RequireModule('package_sales')
  reconcile(
    @Body() dto: ReconcileDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
    @CurrentUser('role') role: string,
  ) {
    return this.service.reconcileAtClose(dto.entries, dto.shiftId ?? null, userId, tenantId, role);
  }

  // Owner-only: set a wallet to an exact balance (e.g. clear test top-ups). Kept in history.
  @Post('adjust')
  @UseGuards(RolesGuard)
  @Roles('OWNER', 'SUPER_ADMIN')
  adjust(
    @Body() dto: AdjustBalanceDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('tenantId') tenantId: string | null,
  ) {
    return this.service.adjustBalance(dto, userId, tenantId);
  }

  @Get('package-sales/list')
  @RequirePermission('sales.create', 'reports.view')
  @UseGuards(ModuleGuard)
  @RequireModule('package_sales')
  listPackageSales(
    @CurrentUser('tenantId') tenantId: string | null,
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
    @Query('carrier')   carrier?: string,
    @Query('saleType')  saleType?: string,
  ) {
    // Default: today in Bangkok time
    const today = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    return this.service.listPackageSales({
      startDate: startDate ?? today,
      endDate,
      carrier,
      saleType,
      tenantId,
    });
  }
}
