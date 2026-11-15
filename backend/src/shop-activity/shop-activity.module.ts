import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { LineMessagingModule } from '../line-messaging/line-messaging.module';
import { ShopActivityService } from './shop-activity.service';

@Module({
  imports:   [NotificationsModule, LineMessagingModule],
  providers: [ShopActivityService],
  exports:   [ShopActivityService],
})
export class ShopActivityModule {}
