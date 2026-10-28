import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RepairSignatureDto {
  @IsIn(['INTAKE'])
  kind: string;

  /** The signature drawn on the screen, as a PNG data URL (a few tens of KB) */
  @IsString()
  @MaxLength(400_000, { message: 'รูปลายเซ็นใหญ่เกินไป' })
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'รูปลายเซ็นไม่ถูกต้อง' })
  image: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerName?: string;
}

/** The customer signs once on the combined slip: the same signature goes on each job in it */
export class BatchSignatureDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  ids: string[];

  @IsString()
  @MaxLength(400_000, { message: 'รูปลายเซ็นใหญ่เกินไป' })
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'รูปลายเซ็นไม่ถูกต้อง' })
  image: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  signerName?: string;
}
