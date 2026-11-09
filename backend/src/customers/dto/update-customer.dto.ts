import { PartialType } from '@nestjs/mapped-types';
import { CreateCustomerDto } from './create-customer.dto';

/**
 * A real class, so the validation pipe checks it and drops nothing silently: with
 * `Partial<CreateCustomerDto>` (a type, which is just Object at runtime) the whole raw body went
 * into the update — a cashier could move a customer to another shop or set loyalty points.
 */
export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {}
