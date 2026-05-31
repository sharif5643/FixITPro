import { IsNumber, IsIn, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsOptional()
  @IsString()
  note?: string;
}
