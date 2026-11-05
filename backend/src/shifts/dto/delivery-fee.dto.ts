import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** A delivery fee for parts (ค่ารถส่งอะไหล่), paid to the driver when the parts arrive */
export class DeliveryFeeDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(100_000)
  amount: number;

  /** The repair job the parts were ordered for: the fee becomes that job's cost */
  @IsOptional()
  @IsString()
  repairId?: string;

  /** Paid from the drawer (default) or by the owner out of pocket */
  @IsOptional()
  @IsBoolean()
  fromDrawer?: boolean;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(200)
  note?: string;
}
