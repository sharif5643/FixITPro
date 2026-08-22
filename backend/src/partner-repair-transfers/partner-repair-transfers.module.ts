import { Module } from '@nestjs/common';
import { DatabaseModule }     from '../database/database.module';
import { AuditLogModule }     from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PartnerRepairTransfersService } from './partner-repair-transfers.service';
import {
  PartnerRepairTransfersController,
  RepairPartnerTransferController,
} from './partner-repair-transfers.controller';

@Module({
  imports:     [DatabaseModule, AuditLogModule, NotificationsModule],
  controllers: [PartnerRepairTransfersController, RepairPartnerTransferController],
  providers:   [PartnerRepairTransfersService],
  exports:     [PartnerRepairTransfersService],
})
export class PartnerRepairTransfersModule {}
