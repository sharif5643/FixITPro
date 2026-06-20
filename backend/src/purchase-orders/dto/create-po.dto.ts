import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsIn,
  Max,
  MaxLength,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePOItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  unitCost: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  discount?: number;
}

export class CreatePurchaseOrderDto {
  @IsString()
  supplierId: string;

  @IsOptional()
  @IsString()
  expectedDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  discount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent?: number;

  @IsOptional()
  @IsIn(['DRAFT', 'ORDERED'])
  status?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePOItemDto)
  items: CreatePOItemDto[];
}
