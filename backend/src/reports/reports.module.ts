import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PermissionGuard } from '../common/guards/permission.guard';
import { CostFixService } from './cost-fix.service';
import { JournalModule } from '../journal/journal.module';

@Module({
  imports: [JournalModule],
  controllers: [ReportsController],
  providers: [ReportsService, CostFixService, PermissionGuard],
  exports: [ReportsService],
})
export class ReportsModule {}
