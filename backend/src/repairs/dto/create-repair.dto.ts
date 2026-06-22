import { IsString, IsNumber, IsOptional, Max, Min, IsDateString, MaxLength, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRepairDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @IsString()
  technicianId?: string;

  @IsString()
  @MaxLength(100)
  deviceBrand: string;

  @IsString()
  @MaxLength(100)
  deviceModel: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deviceColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  deviceImei?: string;

  @IsString()
  @MaxLength(2000)
  issue: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessories?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deviceType?: string;

  @IsOptional()
  @IsArray()
  deviceConditions?: string[];

  @IsOptional()
  @IsArray()
  issueTags?: string[];

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  discount?: number;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  estimateCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  estimatedLaborCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  estimatedPartsCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  deposit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
