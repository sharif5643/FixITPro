import { IsString, IsNumber, IsOptional, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class AdjustStockDto {
  @IsString()
  productId: string;

  @IsIn(['IN', 'OUT', 'ADJUST'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
