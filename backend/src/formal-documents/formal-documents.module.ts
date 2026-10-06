import { Module } from '@nestjs/common';
import { AuditLogModule } from '../audit-log/audit-log.module';
import { TenantActiveGuard } from '../common/guards/tenant-active.guard';
import { PermissionGuard } from '../common/guards/permission.guard';
import { FormalDocumentsController } from './formal-documents.controller';
import { FormalDocumentsService } from './formal-documents.service';

@Module({
  imports:     [AuditLogModule],
  controllers: [FormalDocumentsController],
  providers:   [FormalDocumentsService, TenantActiveGuard, PermissionGuard],
})
export class FormalDocumentsModule {}
