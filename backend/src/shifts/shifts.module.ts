import { Module } from '@nestjs/common';
import { ShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';
import { CarrierWalletModule } from '../carrier-wallet/carrier-wallet.module';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [CarrierWalletModule, AuditLogModule, NotificationsModule],
  controllers: [ShiftsController],
  providers:   [ShiftsService],
  exports:     [ShiftsService],
})
export class ShiftsModule {}
