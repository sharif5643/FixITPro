import { IsString } from 'class-validator';

export class ApproveDifferenceDto {
  @IsString()
  approvalNote: string;
}
