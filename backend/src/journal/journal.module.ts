import { Module } from '@nestjs/common';
import { JournalService } from './journal.service';
import { AuditLogModule } from '../audit-log/audit-log.module';

@Module({
  imports:   [AuditLogModule],
  providers: [JournalService],
  exports:   [JournalService],
})
export class JournalModule {}
