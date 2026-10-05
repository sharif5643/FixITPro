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

  // The shop's own LINE Official Account: channel secret (verifies its webhook) and OA ID (@xxxx)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lineChannelSecret?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  lineOaId?: string;

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
