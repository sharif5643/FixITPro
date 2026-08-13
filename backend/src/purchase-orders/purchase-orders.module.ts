import { Module } from '@nestjs/common';
import { PurchaseOrdersService } from './purchase-orders.service';
import { PurchaseOrdersController } from './purchase-orders.controller';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { AccountingModule } from '../accounting/accounting.module';

@Module({
  imports:     [AuditLogModule, AccountingModule],
  controllers: [PurchaseOrdersController],
  providers:   [PurchaseOrdersService],
})
export class PurchaseOrdersModule {}
