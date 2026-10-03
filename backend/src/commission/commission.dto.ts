import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, Min, ValidateNested, ArrayMaxSize,
} from 'class-validator';
import { REPAIR_TYPES, SALE_SCOPES, SALE_TYPES } from './commission.calc';

export class RepairCommissionDto {
  @IsIn(REPAIR_TYPES as unknown as string[])
  type!: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000)
  value?: number;

  /** Baht per repair type, e.g. {"หน้าจอ": 150} */
  @IsOptional() @IsObject()
  typeRates?: Record<string, number>;
}

export class SaleCommissionDto {
  @IsIn(SALE_TYPES as unknown as string[])
  type!: string;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000)
  value?: number;

  @IsOptional() @IsIn(SALE_SCOPES as unknown as string[])
  scope?: string;
}

/** One person's own rates; an empty type means "use the shop's rate". */
export class StaffCommissionDto {
  @IsString()
  userId!: string;

  @IsOptional() @IsIn([...REPAIR_TYPES, null] as unknown as string[])
  repairType?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000)
  repairValue?: number | null;

  @IsOptional() @IsIn([...SALE_TYPES, null] as unknown as string[])
  saleType?: string | null;

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) @Max(100000)
  saleValue?: number | null;
}

export class UpdateCommissionConfigDto {
  @IsOptional() @ValidateNested() @Type(() => RepairCommissionDto)
  repair?: RepairCommissionDto;

  @IsOptional() @ValidateNested() @Type(() => SaleCommissionDto)
  sale?: SaleCommissionDto;

  @IsOptional() @IsArray() @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => StaffCommissionDto)
  staff?: StaffCommissionDto[];
}
