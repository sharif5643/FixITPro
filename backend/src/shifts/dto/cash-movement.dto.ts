import { IsIn, IsNumber, IsOptional, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';
import { CASH_CATEGORY_IN, CASH_CATEGORY_OUT } from '../shift-cash';
import { Transform, Type } from 'class-transformer';

/** Cash put into or taken out of the drawer by hand during a shift. */
export class CashMovementDto {
  @IsIn(['IN', 'OUT'])
  direction: 'IN' | 'OUT';

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000)
  amount: number;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2, { message: 'กรุณาระบุเหตุผล' })
  @MaxLength(200)
  reason: string;

  /** What it was for (quick money in/out); must match the direction */
  @IsOptional()
  @IsIn([...CASH_CATEGORY_IN, ...CASH_CATEGORY_OUT])
  category?: string;
}
