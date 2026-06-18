import {
  IsString,
  IsNumber,
  IsOptional,
  IsArray,
  ValidateNested,
  Max,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SaleItemDto {
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
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  discount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serialIds?: string[];
}

export class CreateSaleDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsOptional()
  @IsString()
  shiftId?: string;

  // OWNER has branchId=null in JWT. Frontend must send the selected branch
  // so the backend validates BranchStock for the correct branch.
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  amountPaid: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  discount?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SaleItemDto)
  items: SaleItemDto[];
}
