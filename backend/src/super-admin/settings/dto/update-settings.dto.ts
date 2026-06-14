import { IsOptional, IsString, IsBoolean, IsNumber, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSettingsDto {
  @IsOptional() @IsString()  shopName?: string;
  @IsOptional() @IsString()  shopSubtitle?: string;
  @IsOptional() @IsString()  shopPhone?: string;
  @IsOptional() @IsString()  shopAddress?: string;
  @IsOptional() @IsString()  shopEmail?: string;
  @IsOptional() @IsString()  taxId?: string;
  @IsOptional() @IsString()  receiptFooter?: string;
  @IsOptional() @IsString()  paperWidth?: string;
  @IsOptional() @IsString()  paymentQrUrl?: string;
  @IsOptional() @IsNumber()  @Type(() => Number) @Min(0) @Max(100) vatPercent?: number;
  @IsOptional() @IsNumber()  @Type(() => Number) @Min(0) defaultDeposit?: number;
  @IsOptional() @IsNumber()  @Type(() => Number) @Min(0) lowStockAlert?: number;
  @IsOptional() @IsBoolean() autoGenerateSku?: boolean;
  @IsOptional() @IsBoolean() autoGenerateBarcode?: boolean;
  @IsOptional() @IsBoolean() autoPrint?: boolean;
  @IsOptional() @IsBoolean() showTaxId?: boolean;
  @IsOptional() @IsBoolean() showLogo?: boolean;
}
