import { IsString, IsNumber, IsOptional, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateDebtPaymentDto {
  @IsString()
  repairId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsString()
  @IsOptional()
  note?: string;
}
