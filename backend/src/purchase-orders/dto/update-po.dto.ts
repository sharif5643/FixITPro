import { IsString, IsOptional, IsIn } from 'class-validator';

export class UpdatePurchaseOrderDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  expectedDate?: string;

  @IsOptional()
  @IsIn(['DRAFT', 'ORDERED', 'CANCELLED'])
  status?: string;
}
