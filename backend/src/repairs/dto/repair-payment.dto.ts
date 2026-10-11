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

  /**
   * Taken off at pickup (a deal agreed with the customer). The bill is finalCost (or the job's
   * price) minus this; the receipt shows the price, the discount and what was paid.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(10_000_000)
  discount?: number;

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
