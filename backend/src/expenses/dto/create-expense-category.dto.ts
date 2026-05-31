import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class CreateExpenseCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-z_]+$/, { message: 'code ต้องเป็นตัวพิมพ์เล็กและขีดล่างเท่านั้น' })
  @MaxLength(40)
  code: string;
}
