import { IsString, IsNumber, IsOptional, IsIn, Max, Min, IsArray, ArrayMaxSize } from 'class-validator';
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

  /** Price paid per unit for stock coming in (IN only); averaged into the product's cost */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  unitCost?: number;

  @IsOptional()
  @IsString()
  branchId?: string;

  /** IMEI / serial of each unit coming in (IN, products sold by serial) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serials?: string[];

  /** Serials (ids) of the units going out (OUT, products sold by serial) */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serialIds?: string[];
}
