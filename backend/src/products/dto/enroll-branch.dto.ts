import { IsString, IsNumber, IsOptional, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class EnrollBranchDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @Type(() => Number)
  @IsNumber()
  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;
}
