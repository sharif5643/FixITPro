import { IsString, IsOptional } from 'class-validator';

export class CreateCategoryTypeDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  slug?: string;
}
