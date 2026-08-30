import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class RepairPaymentDto {
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  amountPaid: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  finalCost?: number;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(3_650)
  warrantyDays?: number;

  /** Allow partial payment — device is delivered with balance owed */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  allowPartial?: boolean;
}
