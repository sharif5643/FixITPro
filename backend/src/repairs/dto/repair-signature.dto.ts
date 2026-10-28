import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class RepairSignatureDto {
  @IsIn(['INTAKE', 'APPROVAL'])
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
