import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';
import { LineWebhookController } from './line-webhook.controller';
import { LineSimService } from './line-sim.service';
import { LineStaffController } from './line-staff.controller';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CarrierWalletModule } from '../carrier-wallet/carrier-wallet.module';

@Module({
  imports: [DatabaseModule, NotificationsModule, CarrierWalletModule],
  controllers: [LineWebhookController, LineStaffController],
  providers: [LineMessagingService, LineSimService],
  exports: [LineMessagingService],
})
export class LineMessagingModule {}
