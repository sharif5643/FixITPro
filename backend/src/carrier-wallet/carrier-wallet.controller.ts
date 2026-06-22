import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CarrierWalletService } from './carrier-wallet.service';
import { PackageSaleDto } from './dto/package-sale.dto';
import { TopupDto } from './dto/topup.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
}
