import { IsIn } from 'class-validator';

export class ChangePaymentMethodDto {
  @IsIn(['CASH', 'TRANSFER', 'CARD'])
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD';
}
