import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CarrierEnum } from './package-sale.dto';

export class TopupDto {
  @IsEnum(CarrierEnum)
  carrier: CarrierEnum;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  amount: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;
}
