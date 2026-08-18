import { IsBoolean, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class UpdateAccountDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  nameTh?: string;

  @IsOptional()
  @IsString()
  @Length(1, 50)
  subType?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
