import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsInt,
  ValidateNested,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ReceiveItemDto {
  @IsString()
  purchaseOrderItemId: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  quantity: number;

  /** Phones sold by IMEI: one IMEI per unit received */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  serials?: string[];
}

export class ReceiveGoodsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceiveItemDto)
  items: ReceiveItemDto[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  branchId?: string;
}
