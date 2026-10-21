import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CloseShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  closeBalance: number;

  @IsOptional()
  @IsString()
  note?: string;

  /** Of the counted cash, what stays in the drawer as the next shift's float (no more than counted) */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  floatLeft?: number;

  /** Leaving early: the person in this shift who takes over the drawer and the carrier wallets */
  @IsOptional()
  @IsString()
  handoverToUserId?: string;
}
