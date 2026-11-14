import { IsString, IsOptional, IsIn, MaxLength, IsDateString } from 'class-validator';

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

/** The supplier's tax invoice for the goods on a PO (any time after ordering, also after receiving) */
export class SupplierTaxInvoiceDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  supplierTaxInvoiceNo?: string;

  @IsOptional()
  @IsDateString()
  supplierTaxInvoiceDate?: string;
}
