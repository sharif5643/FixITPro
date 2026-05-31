import { Module } from '@nestjs/common';
import { RemindersController } from './reminders.controller';
import { RemindersService }    from './reminders.service';
import { AuditLogModule }      from '../audit-log/audit-log.module';

@Module({
  imports:     [AuditLogModule],
  controllers: [RemindersController],
  providers:   [RemindersService],
  exports:     [RemindersService],
})
export class RemindersModule {}
