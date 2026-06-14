import { Module } from '@nestjs/common';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [AuditLogModule, NotificationsModule],
  controllers: [StockController],
  providers:   [StockService, TenantActiveGuard],
  exports:     [StockService],
})
export class StockModule {}
