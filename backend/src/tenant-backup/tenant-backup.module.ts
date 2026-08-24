import { Module } from '@nestjs/common';
import { TenantBackupService } from './tenant-backup.service';
import { TenantRestoreService } from './tenant-restore.service';
import { TenantBackupController } from './tenant-backup.controller';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [TenantBackupController],
  providers: [TenantBackupService, TenantRestoreService],
  exports: [TenantBackupService, TenantRestoreService],
})
export class TenantBackupModule {}
