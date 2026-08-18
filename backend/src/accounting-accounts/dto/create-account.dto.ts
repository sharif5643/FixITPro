import { AccountType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Length(4, 10)
  @Matches(/^\d+$/, { message: 'code must be numeric digits' })
  code: string;

  @IsString()
  @Length(1, 100)
  name: string;

  @IsString()
  @Length(1, 100)
  nameTh: string;

  @IsEnum(AccountType)
  type: AccountType;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  subType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
