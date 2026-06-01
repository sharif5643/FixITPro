import { IsString, IsArray, IsNumber, IsOptional, ValidateNested, IsIn, Max, Min, IsInt } from 'class-validator';
import { Type } from 'class-transformer';

export class RefundSaleItemDto {
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

export class RefundSaleDto {
  @IsString()
  reason: string;

  @IsString()
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RefundSaleItemDto)
  items: RefundSaleItemDto[];

  @IsOptional()
  @IsString()
  note?: string;
}
