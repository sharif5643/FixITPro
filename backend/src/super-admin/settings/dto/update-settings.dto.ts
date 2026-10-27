import { IsOptional, IsString, IsBoolean, IsNumber, Min, Max, MaxLength } from 'class-validator';
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
  @IsOptional() @IsString() @MaxLength(30)  promptpayId?: string;
  @IsOptional() @IsString() @MaxLength(1000) renewalBankInfo?: string;
  @IsOptional() @IsNumber()  @Type(() => Number) @Min(0) @Max(100) vatPercent?: number;
  @IsOptional() @IsNumber()  @Type(() => Number) @Min(0) defaultDeposit?: number;
  @IsOptional() @IsNumber()  @Type(() => Number) @Min(0) lowStockAlert?: number;
  @IsOptional() @IsBoolean() autoGenerateSku?: boolean;
  @IsOptional() @IsBoolean() autoGenerateBarcode?: boolean;
  @IsOptional() @IsBoolean() autoPrint?: boolean;
  @IsOptional() @IsBoolean() showTaxId?: boolean;
  @IsOptional() @IsBoolean() showLogo?: boolean;
}

/** Empty string removes a key; a key left out is unchanged. */
export class UpdatePlatformKeysDto {
  @IsOptional() @IsString() @MaxLength(40)   LINE_OA_ID?: string;
  @IsOptional() @IsString() @MaxLength(100)  LINE_CHANNEL_SECRET?: string;
  @IsOptional() @IsString() @MaxLength(1000) LINE_CHANNEL_ACCESS_TOKEN?: string;
  @IsOptional() @IsString() @MaxLength(300)  ANTHROPIC_API_KEY?: string;
  @IsOptional() @IsString() @MaxLength(10000) FIREBASE_SERVICE_ACCOUNT?: string;
}
