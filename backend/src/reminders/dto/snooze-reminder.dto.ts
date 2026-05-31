import { IsString, IsNotEmpty, IsNumber, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class SnoozeReminderDto {
  @IsString()
  @IsNotEmpty()
  entityType: string;

  @IsString()
  @IsNotEmpty()
  entityId: string;

  @Type(() => Number)
  @IsNumber()
  @IsIn([5, 15, 30])
  minutes: number;
}
