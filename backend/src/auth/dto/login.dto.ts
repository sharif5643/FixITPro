import { Transform } from 'class-transformer';
import { IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsString()
  @MaxLength(200)
  email: string; // accepts email OR username — field name kept for API compatibility

  @IsString()
  @MinLength(4)
  @MaxLength(128)
  password: string;
}
