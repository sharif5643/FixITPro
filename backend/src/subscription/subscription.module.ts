import { Module } from '@nestjs/common';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionService } from './subscription.service';
import { RolesGuard } from '../common/guards/roles.guard';

@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, RolesGuard],
  exports: [SubscriptionService],
})
export class SubscriptionModule {}
