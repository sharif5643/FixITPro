import { IsString, IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateTransferDto {
  @IsString()
  fromBranchId: string;

  @IsString()
  toBranchId: string;

  @IsString()
  productId: string;

  @IsInt()
  @Min(1)
  @Max(10_000)
  quantity: number;

  @IsOptional()
  @IsString()
  note?: string;
}
