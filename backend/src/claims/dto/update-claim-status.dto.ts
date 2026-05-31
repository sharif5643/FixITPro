import { IsString, IsIn, IsOptional, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';

const VALID_STATUSES = [
  'CHECKING', 'SENT_SUPPLIER', 'WAITING_RESULT',
  'APPROVED', 'REJECTED', 'REPLACED', 'RETURNED', 'CLOSED', 'CANCELLED',
];

export class UpdateClaimStatusDto {
  @IsIn(VALID_STATUSES)
  status: string;

  @IsOptional()
  @IsString()
  note?: string;

  @IsOptional()
  @IsString()
  replacementSerialId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  claimCost?: number;
}
