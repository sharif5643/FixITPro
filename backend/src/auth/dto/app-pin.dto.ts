import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

const SIX_DIGITS = /^\d{6}$/;

export class SetAppPinDto {
  @IsString() @Matches(SIX_DIGITS, { message: 'PIN ต้องเป็นตัวเลข 6 หลัก' }) pin: string;
  /** Changing a PIN: the current one, or the account password when it was forgotten */
  @IsOptional() @IsString() @MaxLength(6) currentPin?: string;
  @IsOptional() @IsString() @MaxLength(128) password?: string;
}

export class VerifyAppPinDto {
  @IsString() @Matches(SIX_DIGITS, { message: 'PIN ต้องเป็นตัวเลข 6 หลัก' }) pin: string;
}
