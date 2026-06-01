import { IsString, IsNumber, IsOptional, IsIn, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustStockDto {
  @IsString()
  productId: string;

  @IsIn(['IN', 'OUT', 'ADJUST'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  @Min(-100_000)
  @Max(100_000)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
