import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { CarrierWalletModule } from '../carrier-wallet/carrier-wallet.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports:     [CarrierWalletModule, AuditLogModule, NotificationsModule, ExpensesModule],
  controllers: [ShiftsController],
  providers:   [ShiftsService],
  exports:     [ShiftsService],
})
export class ShiftsModule {}
