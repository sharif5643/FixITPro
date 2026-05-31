import { IsNumber, IsString, IsOptional, IsIn, Min } from 'class-validator';

export class AdditionalPaymentDto {
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsString()
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsOptional()
  @IsString()
  note?: string;
}
