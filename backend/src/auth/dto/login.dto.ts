import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class LoginDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;
}
