import { Module } from '@nestjs/common';
import { TenantsController } from './tenants/tenants.controller';
import { TenantsService } from './tenants/tenants.service';
import { PaymentsController } from './payments/payments.controller';
import { PaymentsService } from './payments/payments.service';

@Module({
  controllers: [TenantsController, PaymentsController],
  providers: [TenantsService, PaymentsService],
})
export class SuperAdminModule {}
