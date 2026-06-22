import {
  IsString,
  IsNumber,
  IsOptional,
  Max,
  MaxLength,
  Min,
  IsIn,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateRepairDto {
  @IsOptional()
  @IsIn([
    'RECEIVED',
    'DIAGNOSING',
    'WAITING_APPROVAL',
    'APPROVED',
    'WAITING_PARTS',
    'IN_PROGRESS',
    'COMPLETED',
    'DELIVERED',
    'CANCELLED',
  ])
  status?: string;

  @IsOptional()
  @IsString()
  technicianId?: string;

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
  finalCost?: number;

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
  estimatedTotal?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  approvalNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  actualLaborCost?: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceImei?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceBrand?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  deviceModel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  deviceColor?: string;

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
  @IsString()
  @MaxLength(2000)
  issue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  accessories?: string;

  @IsOptional()
  @IsString()
  dueDate?: string;
}
