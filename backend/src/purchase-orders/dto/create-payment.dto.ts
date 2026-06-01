import { IsNumber, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsOptional()
  @IsString()
  note?: string;
}
