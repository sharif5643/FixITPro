import {
  IsEnum, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export enum CarrierEnum {
  AIS  = 'AIS',
  TRUE = 'TRUE',
  DTAC = 'DTAC',
  NT   = 'NT',
}

export class PackageSaleDto {
  @IsEnum(CarrierEnum)
  carrier: CarrierEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  packageAmount: number;

  @IsString()
  paymentMethod: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
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
