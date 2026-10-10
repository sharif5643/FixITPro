import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';

export class RepairPriceRowDto {
  /** "" = any brand */
  @IsString() @MaxLength(60)
  brand!: string;

  /** "" = every model of the brand */
  @IsString() @MaxLength(80)
  model!: string;

  @IsString() @MaxLength(120)
  service!: string;

  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  price!: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0)
  costPrice?: number | null;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0)
  warrantyDays?: number | null;
}

export class UpsertRepairPricesDto {
  @IsArray() @ArrayMaxSize(500)
  @ValidateNested({ each: true }) @Type(() => RepairPriceRowDto)
  rows!: RepairPriceRowDto[];
}
