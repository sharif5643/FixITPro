import { IsString, IsOptional, IsIn } from 'class-validator';

export class CreateSerialDto {
  @IsString()
  serial: string;

  @IsString()
  productId: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  purchaseOrderItemId?: string;
}
