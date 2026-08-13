import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { RolesGuard } from '../common/guards/roles.guard';
import { PlanLimitsModule } from '../plan-limits/plan-limits.module';

@Module({
  imports:     [PlanLimitsModule],
  controllers: [SubscriptionController],
  providers:   [SubscriptionService, RolesGuard],
  exports:     [SubscriptionService],
})
export class SubscriptionModule {}
