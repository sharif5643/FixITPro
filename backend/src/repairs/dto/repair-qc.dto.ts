import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RepairQcDto {
  @IsBoolean()
  touchScreen: boolean;

  @IsBoolean()
  speaker: boolean;

  @IsBoolean()
  microphone: boolean;

  @IsBoolean()
  charging: boolean;

  @IsBoolean()
  camera: boolean;

  @IsBoolean()
  wifi: boolean;

  @IsBoolean()
  biometric: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
