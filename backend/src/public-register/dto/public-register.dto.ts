import { Transform } from 'class-transformer'
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator'

export class PublicRegisterDto {
  @IsNotEmpty({ message: 'ชื่อร้านค้าจำเป็นต้องกรอก' })
  @IsString()
  shopName: string

  @IsNotEmpty({ message: 'ชื่อเจ้าของจำเป็นต้องกรอก' })
  @IsString()
  ownerName: string

  @IsOptional()
  @IsString()
  @Matches(/^[0-9+\-\s()]{7,20}$/, { message: 'รูปแบบเบอร์โทรศัพท์ไม่ถูกต้อง' })
  phone?: string

  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'รูปแบบอีเมลไม่ถูกต้อง' })
  @IsNotEmpty({ message: 'อีเมลจำเป็นต้องกรอก' })
  email: string

  @IsNotEmpty({ message: 'รหัสผ่านจำเป็นต้องกรอก' })
  @MinLength(8, { message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' })
  password: string

  @IsOptional()
  @IsString()
  businessType?: string

  @IsOptional()
  @IsString()
  themeColor?: string

  @IsOptional()
  @IsString()
  themePreset?: string
}
