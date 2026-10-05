import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';
import { LineWebhookController } from './line-webhook.controller';
import { LineStaffController } from './line-staff.controller';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [LineWebhookController, LineStaffController],
  providers: [LineMessagingService],
  exports: [LineMessagingService],
})
export class LineMessagingModule {}
