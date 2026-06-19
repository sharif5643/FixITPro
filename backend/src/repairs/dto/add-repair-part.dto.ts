import { IsString, IsNumber, IsOptional, IsBoolean, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class AddRepairPartDto {
  @IsString()
  productId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsOptional()
  @IsBoolean()
  chargeToCustomer?: boolean;   // default false — parts are COGS only unless explicitly set

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  price?: number;   // sellPrice override — only used when chargeToCustomer=true
}
