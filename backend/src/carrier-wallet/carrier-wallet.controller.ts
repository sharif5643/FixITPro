import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsEnum, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CarrierWalletService } from './carrier-wallet.service';
import { PackageSaleDto, CarrierEnum } from './dto/package-sale.dto';
import { TopupDto } from './dto/topup.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { RequireModule } from '../common/decorators/require-module.decorator';
import { ModuleGuard } from '../common/guards/module.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
}

@UseGuards(JwtAuthGuard, TenantActiveGuard)
@Controller('carrier-wallet')
export class CarrierWalletController {
  constructor(private readonly service: CarrierWalletService) {}

  @Get('balances')
  getBalances() {
    return this.service.getBalances();
  }

  @Post('package-sale')
  createPackageSale(
    @Body() dto: PackageSaleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createPackageSale(dto, userId);
  }

  @Post('topup')
  topup(
    @Body() dto: TopupDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.topup(dto, userId);
  }

  @Get('movements')
  getMovements(
    @Query('carrier') carrier?: string,
    @Query('date')    date?: string,
  ) {
    return this.service.getMovements(carrier, date);
  }

  @Get('package-sales')
  getPackageSales(
    @Query('date')    date?: string,
    @Query('carrier') carrier?: string,
  ) {
    return this.service.getPackageSales(date, carrier);
  }

  @Post('sim-sale')
  createSimSale(
    @Body() dto: SimSaleDto,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.createSimSale(dto, userId);
  }

  @Get('package-sales/list')
  @UseGuards(ModuleGuard)
  @RequireModule('package_sales')
  listPackageSales(
    @Query('startDate') startDate?: string,
    @Query('endDate')   endDate?: string,
    @Query('carrier')   carrier?: string,
    @Query('saleType')  saleType?: string,
  ) {
    const today = new Date().toISOString().slice(0, 10);
    return this.service.listPackageSales({
      startDate: startDate ?? today,
      endDate:   endDate   ? `${endDate}T23:59:59` : undefined,
      carrier,
      saleType,
    });
  }
}
