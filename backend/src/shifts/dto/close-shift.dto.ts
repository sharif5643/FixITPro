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

  /** Leaving early: the person in this shift who takes over the drawer and the carrier wallets */
  @IsOptional()
  @IsString()
  handoverToUserId?: string;
}
