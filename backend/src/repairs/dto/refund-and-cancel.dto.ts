import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class RefundAndCancelDto {
  @IsString()
  @IsNotEmpty()
  reason: string;

  @IsOptional()
  @IsString()
  note?: string;
}
