import { IsString, MinLength } from 'class-validator';

export class VoidSaleDto {
  @IsString()
  @MinLength(3, { message: 'กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร' })
  reason: string;
}
