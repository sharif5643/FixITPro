import { IsNumber, IsString, IsOptional, IsIn, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdditionalPaymentDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(10_000_000)
  amount: number;

  @IsString()
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsOptional()
  @IsString()
  note?: string;
}
