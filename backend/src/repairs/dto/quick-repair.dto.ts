import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Transform, Type } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/**
 * A repair recorded in one step when the customer pays and takes the device (no intake ticket
 * was made at the time). Parts are taken from stock later, from the "ยังไม่เบิกอะไหล่" list.
 */
export class QuickRepairDto {
  @IsOptional()
  @IsString()
  branchId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  customerName?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  deviceBrand?: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณาระบุรุ่นเครื่อง' })
  @MaxLength(100)
  deviceModel: string;

  /** What was done, e.g. "เปลี่ยนจอ" */
  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'กรุณาระบุว่าซ่อมอะไร' })
  @MaxLength(500)
  issue: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10_000_000)
  price: number;

  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(3650)
  warrantyDays?: number;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}
