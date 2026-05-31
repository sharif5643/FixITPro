import { IsEnum, IsIn, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { TenantPlan } from '@prisma/client';

export class ActivateTenantDto {
  @IsEnum(TenantPlan)
  plan: TenantPlan;

  @IsOptional()
  @IsIn([30, 90, 365])
  duration?: number;

  @IsOptional()
  @IsString()
  customExpiryDate?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
