import { IsString, IsOptional, IsInt, IsEmail, Min, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSupplierDto {
  @IsString()
  @MaxLength(200)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsEmail()
  @MaxLength(200)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  creditDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
