import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  Max,
  MaxLength,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsString()
  @MaxLength(100)
  sku: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  barcode?: string;

  @IsIn(['PHONE', 'SIM', 'ACCESSORY', 'PART'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  price: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  costPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  stock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100_000)
  minStock?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsIn(['NO_WARRANTY', 'SHOP_WARRANTY', 'BRAND_WARRANTY'])
  warrantyType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3_650)
  warrantyDays?: number;

  @IsOptional()
  @IsBoolean()
  hasSerial?: boolean;

  // Target branch for the initial BranchStock row.
  // Required when OWNER/SUPER_ADMIN creates a product with stock > 0.
  // Ignored for non-OWNER: the server enforces JWT branchId instead.
  @IsOptional()
  @IsString()
  branchId?: string;
}
