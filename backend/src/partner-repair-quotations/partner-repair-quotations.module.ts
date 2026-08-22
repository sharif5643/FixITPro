import { Module } from '@nestjs/common';
import { DatabaseModule }      from '../database/database.module';
import { AuditLogModule }      from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PartnerRepairQuotationsService }    from './partner-repair-quotations.service';
import { PartnerRepairQuotationsController } from './partner-repair-quotations.controller';

@Module({
  imports:     [DatabaseModule, AuditLogModule, NotificationsModule],
  controllers: [PartnerRepairQuotationsController],
  providers:   [PartnerRepairQuotationsService],
  exports:     [PartnerRepairQuotationsService],
})
export class PartnerRepairQuotationsModule {}
