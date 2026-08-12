import { IsString, IsArray, IsNumber, IsOptional, ValidateNested, IsIn, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class ExchangeReturnItemDto {
  @IsString()
  saleItemId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  refundPrice: number;
}

export class ExchangeNewItemDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  price: number;
}

export class ExchangeSaleDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExchangeReturnItemDto)
  returnItems: ExchangeReturnItemDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExchangeNewItemDto)
  newItems: ExchangeNewItemDto[];

  @IsString()
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsString()
  reason: string;

  @IsOptional()
  @IsString()
  note?: string;
}
