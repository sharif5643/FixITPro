import { IsString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class SetBranchStockDto {
  @IsString()
  productId: string;

  @IsInt()
  @Min(0)
  @Max(100_000)
  quantity: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  minStock?: number;
}
