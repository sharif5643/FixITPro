import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { PermissionGuard } from '../common/guards/permission.guard';

@Module({
  controllers: [NotificationsController],
  providers:   [NotificationsService, PermissionGuard],
  exports:     [NotificationsService],
})
export class NotificationsModule {}
