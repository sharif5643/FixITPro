import { IsString, Matches, MaxLength } from 'class-validator';

export class MySignatureDto {
  /** Drawn on the screen, as a PNG data URL */
  @IsString()
  @MaxLength(400_000, { message: 'รูปลายเซ็นใหญ่เกินไป' })
  @Matches(/^data:image\/png;base64,[A-Za-z0-9+/=]+$/, { message: 'รูปลายเซ็นไม่ถูกต้อง' })
  image: string;
}
