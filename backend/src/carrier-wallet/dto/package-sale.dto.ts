import {
  IsBoolean, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
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

  // ── Pay later ("ค้างจ่าย") ── amountPaid is then what the customer pays now (may be 0)
  @IsOptional()
  @IsBoolean()
  payLater?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  debtorName?: string;

  // Defaults to phoneNumber; one unpaid sale per phone number at a time
  @IsOptional()
  @IsString()
  @MaxLength(20)
  debtorPhone?: string;
}

export class PayPackageDebtDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(100_000)
  amount: number;

  @IsEnum(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD';

  @IsOptional()
  @IsString()
  shiftId?: string;

  @IsString()
  @MaxLength(100)
  cashierName: string;
}
