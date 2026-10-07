import { IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class OpenShiftDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  openBalance: number;

  @IsOptional()
  @IsString()
  note?: string;

  /** Taking over from someone who left early: the shift they closed and handed over */
  @IsOptional()
  @IsString()
  handoverFromShiftId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  aisOpeningBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  trueOpeningBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  dtacOpeningBalance?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1_000_000)
  ntOpeningBalance?: number;
}
