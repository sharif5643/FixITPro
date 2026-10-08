import { IsIn, IsNumber, IsString, MaxLength, Min, Max, MinLength } from 'class-validator';
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
}
