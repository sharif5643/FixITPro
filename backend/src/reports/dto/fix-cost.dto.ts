import { IsBoolean, IsNotEmpty, IsNumber, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class FixCostDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  /** the right cost of one unit */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01, { message: 'ราคาทุนต้องมากกว่า 0' })
  @Max(10_000_000, { message: 'ราคาทุนต้องไม่เกิน 10,000,000 บาท' })
  costPrice: number;

  /** also the bills already sold with a cost of 0 or above what they sold for */
  @IsBoolean()
  fixBills: boolean;
}
