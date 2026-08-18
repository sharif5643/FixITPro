import { IsOptional, IsString } from 'class-validator';

export class InitializeAccountsDto {
  @IsOptional()
  @IsString()
  tenantId?: string;
}
