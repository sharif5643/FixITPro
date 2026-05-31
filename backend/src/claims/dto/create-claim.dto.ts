import { IsString, IsIn, IsOptional } from 'class-validator';

export class CreateClaimDto {
  @IsString()
  serialNumberId: string;

  @IsIn(['SHOP', 'BRAND', 'SUPPLIER'])
  claimType: string;

  @IsString()
  symptom: string;

  @IsOptional()
  @IsString()
  note?: string;
}
