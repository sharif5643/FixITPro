import { IsString, IsNumber, IsOptional, Max, Min, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRepairDto {
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
  technicianId?: string;

  @IsString()
  deviceBrand: string;

  @IsString()
  deviceModel: string;

  @IsOptional()
  @IsString()
  deviceColor?: string;

  @IsOptional()
  @IsString()
  deviceImei?: string;

  @IsString()
  issue: string;

  @IsOptional()
  @IsString()
  accessories?: string;

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
  deposit?: number;

  @IsOptional()
  @IsString()
  note?: string;
}
