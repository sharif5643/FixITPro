import { IsString, IsOptional } from 'class-validator';

export class ReversePaymentDto {
  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  note?: string;
}
