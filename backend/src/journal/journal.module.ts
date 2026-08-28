import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { JournalController } from './journal.controller';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingReportsController } from './accounting-reports.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports:     [AuditLogModule],
  controllers: [JournalController, AccountingReportsController],
  providers:   [JournalService, AccountingReportsService],
  exports:     [JournalService],
})
export class JournalModule {}
