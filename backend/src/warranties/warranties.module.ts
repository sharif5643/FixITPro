import { Module } from '@nestjs/common';
import { WarrantiesController } from './warranties.controller';
import { WarrantiesService } from './warranties.service';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [WarrantiesController],
  providers:   [WarrantiesService],
  exports:     [WarrantiesService],
})
export class WarrantiesModule {}
