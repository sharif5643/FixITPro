import { IsString, IsInt, IsOptional, Min } from 'class-validator';

export class SetBranchStockDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(0)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minStock?: number;
}
