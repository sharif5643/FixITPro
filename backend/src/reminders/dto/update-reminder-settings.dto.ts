import { IsOptional, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateReminderSettingsDto {
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  soundEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  soundVolume?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(60)
  popupIntervalMinutes?: number;

  @IsOptional()
  @IsBoolean()
  urgentRepairEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  transferPendingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  pickupWaitingEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  vipRepairEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  partsRequestEnabled?: boolean;
}
