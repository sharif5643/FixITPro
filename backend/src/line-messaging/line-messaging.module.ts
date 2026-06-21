import { Module } from '@nestjs/common';
import { LineMessagingService } from './line-messaging.service';
import { LineWebhookController } from './line-webhook.controller';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [LineWebhookController],
  providers: [LineMessagingService],
  exports: [LineMessagingService],
})
export class LineMessagingModule {}
