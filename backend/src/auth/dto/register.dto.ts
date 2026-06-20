import { IsEmail, IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @MaxLength(100)
  name: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsIn(['CASHIER', 'TECHNICIAN', 'STOCK_STAFF'])
  role?: string;
}
