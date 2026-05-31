import { IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  closeBalance: number;

  @IsOptional()
  @IsString()
  note?: string;
}
