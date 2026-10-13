import { IsString, IsNumber, IsOptional, IsInt, Min, IsArray, ArrayMaxSize } from 'class-validator';
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

  /** IMEI / serial of each unit, for products sold by serial */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  serials?: string[];
}
