import { IsOptional, IsString, IsIn } from 'class-validator';

export class UpdateSerialDto {
  @IsOptional()
  @IsIn(['IN_STOCK', 'RETURNED', 'DEFECTIVE'])
  status?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
