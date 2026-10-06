import {
  IsString,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { THEME_KEYS, THEME_PRESETS } from '../../common/theme-sets';

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

  // The shop's theme set ('original' = the product's own look) and light / dark / auto
  @IsOptional()
  @IsIn(THEME_KEYS as unknown as string[], { message: 'ไม่มีชุดธีมนี้' })
  themeKey?: string | null;

  @IsOptional()
  @IsIn(THEME_PRESETS as unknown as string[])
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
