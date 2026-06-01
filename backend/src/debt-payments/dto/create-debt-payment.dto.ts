import { IsString, IsNumber, IsOptional, IsIn, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDebtPaymentDto {
  @IsString()
  repairId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsString()
  @IsOptional()
  note?: string;
}
