import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class RepairPaymentDto {
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountPaid: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  finalCost?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  warrantyDays?: number;
}
