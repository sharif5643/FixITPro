import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidExpenseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  voidReason: string;
}
