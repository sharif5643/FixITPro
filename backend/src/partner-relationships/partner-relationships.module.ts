import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PartnerRelationshipsService } from './partner-relationships.service';
import { PartnerRelationshipsController } from './partner-relationships.controller';

@Module({
  imports: [DatabaseModule, AuditLogModule, NotificationsModule],
  controllers: [PartnerRelationshipsController],
  providers:   [PartnerRelationshipsService],
  exports:     [PartnerRelationshipsService],
})
export class PartnerRelationshipsModule {}
