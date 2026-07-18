import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseSessionDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedAmount: number;

  @IsOptional()
  @IsString()
  closingNote?: string;

  @IsOptional()
  @IsString()
  differenceReason?: string;
}
