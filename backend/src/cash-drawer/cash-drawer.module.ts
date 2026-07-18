import { Module } from '@nestjs/common';
import { CashDrawerController } from './cash-drawer.controller';
import { CashDrawerService }    from './cash-drawer.service';
import { AuditLogModule }       from '../audit-log/audit-log.module';
import { NotificationsModule }  from '../notifications/notifications.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [CashDrawerController],
  providers:   [CashDrawerService],
  exports:     [CashDrawerService],
})
export class CashDrawerModule {}
