import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @IsString()
  name: string;

  @IsString()
  sku: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsIn(['PHONE', 'SIM', 'ACCESSORY', 'PART'])
  type: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  price: number;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  stock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
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
