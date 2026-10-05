import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { SubscriptionPaymentsService } from './subscription-payments.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports:     [PlanLimitsModule],
  controllers: [SubscriptionController],
  providers:   [SubscriptionService, SubscriptionPaymentsService, RolesGuard],
  exports:     [SubscriptionService],
})
export class SubscriptionModule {}
