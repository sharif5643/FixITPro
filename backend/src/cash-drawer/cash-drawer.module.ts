import { Module } from '@nestjs/common';
import { JournalModule } from '../journal/journal.module';
import { CashDrawerController } from './cash-drawer.controller';
import { CashDrawerService }    from './cash-drawer.service';
import { AuditLogModule }       from '../audit-log/audit-log.module';
import { NotificationsModule }  from '../notifications/notifications.module';

@Module({
  imports:     [JournalModule, AuditLogModule, NotificationsModule],
  controllers: [CashDrawerController],
  providers:   [CashDrawerService],
  exports:     [CashDrawerService],
})
export class CashDrawerModule {}
