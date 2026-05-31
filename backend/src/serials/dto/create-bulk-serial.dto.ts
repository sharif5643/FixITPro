import { IsString, IsArray, IsOptional, ArrayMinSize } from 'class-validator';

export class CreateBulkSerialDto {
  @IsString()
  productId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  serials: string[];

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  purchaseOrderItemId?: string;
}
