import { Module } from '@nestjs/common';
import { RepairsController } from './repairs.controller';
import { RepairsService } from './repairs.service';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { WarrantiesModule } from '../warranties/warranties.module';

@Module({
  imports:     [AuditLogModule, WarrantiesModule],
  controllers: [RepairsController],
  providers:   [RepairsService, TenantActiveGuard],
  exports:     [RepairsService],
})
export class RepairsModule {}
