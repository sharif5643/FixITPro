import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

/** Why goods leave stock without being sold */
export const WRITE_OFF_REASONS = {
  FREEBIE:      'แถม',
  CLAIM:        'เคลม',
  SWAP:         'เปลี่ยนให้ลูกค้า',
  INTERNAL_USE: 'ใช้ในร้าน/ช่างใช้',
  DAMAGED:      'เสีย/ชำรุด',
  OTHER:        'อื่นๆ',
} as const;
export type WriteOffReason = keyof typeof WRITE_OFF_REASONS;

export class WriteOffItemDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity: number;

  /** Products sold by IMEI: which units leave */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serialIds?: string[];
}

export class WriteOffDto {
  @IsIn(Object.keys(WRITE_OFF_REASONS))
  reason: WriteOffReason;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;

  @IsOptional()
  @IsString()
  branchId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => WriteOffItemDto)
  items: WriteOffItemDto[];
}
