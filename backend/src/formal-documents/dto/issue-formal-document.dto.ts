import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, Matches, MaxLength, ValidateNested,
} from 'class-validator';

export const FORMAL_DOC_TYPES = ['QUOTATION', 'INVOICE', 'RECEIPT'] as const;
export type FormalDocType = (typeof FORMAL_DOC_TYPES)[number];

export class FormalBuyerDto {
  @IsOptional() @IsString() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(500) address?: string;
  @IsOptional() @IsString() @MaxLength(20)  taxId?: string;
  @IsOptional() @IsString() @MaxLength(100) taxBranch?: string;
  @IsOptional() @IsString() @MaxLength(20)  phone?: string;
}

/** Wording a person may change on a line. Amounts always come from the repair jobs. */
export class FormalLineOverrideDto {
  @IsString() @MaxLength(200) key: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(500) detail?: string;
  @IsOptional() @IsString() @MaxLength(30)  unit?: string;
}

export class FormalDocumentDraftDto {
  @IsIn(FORMAL_DOC_TYPES as unknown as string[])
  type: FormalDocType;

  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsString({ each: true })
  repairIds: string[];

  /** SHOP = shop name from settings, LEGAL = owner's legal name from settings */
  @IsOptional() @IsIn(['SHOP', 'LEGAL'])
  nameMode?: 'SHOP' | 'LEGAL';

  @IsOptional() @ValidateNested() @Type(() => FormalBuyerDto)
  buyer?: FormalBuyerDto;

  @IsOptional() @IsArray() @ArrayMaxSize(300) @ValidateNested({ each: true }) @Type(() => FormalLineOverrideDto)
  lines?: FormalLineOverrideDto[];

  @IsOptional() @IsString() @MaxLength(1000)
  note?: string;

  /** yyyy-MM-dd, the date printed on the paper */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/)
  docDate?: string;

  /** leave the date blank for writing by hand (not allowed on a tax invoice) */
  @IsOptional() @IsBoolean()
  hideDate?: boolean;
}
