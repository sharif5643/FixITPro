import {
  IsEnum, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CarrierEnum {
  AIS  = 'AIS',
  TRUE = 'TRUE',
  DTAC = 'DTAC',
  NT   = 'NT',
}

// SIM_SALE goes through POST /carrier-wallet/sim-sale (no wallet deduction)
export enum WalletSaleTypeEnum {
  PROMO  = 'PROMO',
  TOPUP  = 'TOPUP',
  BUNDLE = 'BUNDLE',
}

export class PackageSaleDto {
  @IsEnum(CarrierEnum)
  carrier: CarrierEnum;

  @IsOptional()
  @IsEnum(WalletSaleTypeEnum)
  saleType?: WalletSaleTypeEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100_000)
  packageAmount: number;

  // Override for the amount deducted from the carrier wallet.
  // Omitted → default 97% of packageAmount. Must not exceed packageAmount.
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000)
  dealerCost?: number;

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
