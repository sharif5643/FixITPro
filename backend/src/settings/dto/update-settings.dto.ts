import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  shopName?: string;

  @IsOptional()
  @IsString()
  shopSubtitle?: string;

  @IsOptional()
  @IsString()
  shopPhone?: string;

  @IsOptional()
  @IsString()
  shopAddress?: string;

  @IsOptional()
  @IsString()
  shopEmail?: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  // Formal A4 documents: legal name of the owner / company, and tax branch (e.g. สำนักงานใหญ่)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  taxBranch?: string;

  // The shop's main colour (#rrggbb, or 'none' for the product's default look) and light / dark / auto
  @IsOptional()
  @Matches(/^(#[0-9a-fA-F]{6}|none)$/, { message: 'สีต้องอยู่ในรูปแบบ #RRGGBB' })
  themeColor?: string | null;

  @IsOptional()
  @IsIn(['light', 'dark', 'auto'])
  themePreset?: string | null;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsString()
  receiptFooter?: string;

  @IsOptional()
  @IsIn(['58mm', '80mm'])
  paperWidth?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  vatPercent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  defaultDeposit?: number;

  @IsOptional()
  @IsBoolean()
  autoGenerateSku?: boolean;

  @IsOptional()
  @IsBoolean()
  autoGenerateBarcode?: boolean;

  @IsOptional()
  @IsBoolean()
  autoPrint?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  lowStockAlert?: number;

  @IsOptional()
  @IsString()
  repairWarrantyText?: string;

  @IsOptional()
  @IsString()
  paymentQrUrl?: string;

  @IsOptional()
  @IsBoolean()
  showTaxId?: boolean;

  @IsOptional()
  @IsBoolean()
  showLogo?: boolean;

  @IsOptional()
  @IsString()
  lineChannelAccessToken?: string;

  @IsOptional()
  @IsBoolean()
  lineNotifyEnabled?: boolean;

  @IsOptional()
  @IsString()
  promptpayId?: string;

  @IsOptional()
  @IsIn(['NONE', 'PERCENT_TOTAL', 'PERCENT_LABOR', 'FIXED', 'BY_TYPE'])
  techCommissionType?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100000)
  techCommissionValue?: number;
}
