import { IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TenantPlan } from '@prisma/client';

export class CreatePaymentDto {
  @IsNotEmpty()
  @IsString()
  tenantId: string;

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
  paymentReference?: string;

  @IsOptional()
  @IsString()
  paymentDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  paymentAmount?: number;

  @IsOptional()
  @IsString()
  paymentNote?: string;
}
