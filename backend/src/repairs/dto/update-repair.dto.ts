import {
  IsString,
  IsNumber,
  IsOptional,
  Min,
  IsIn,
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
  estimateCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  finalCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  deposit?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedLaborCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedPartsCost?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedTotal?: number;

  @IsOptional()
  @IsString()
  approvalNote?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actualLaborCost?: number;
}
