import { Module } from '@nestjs/common';
import { ReportsModule } from '../reports/reports.module';
import { LineMessagingModule } from '../line-messaging/line-messaging.module';
import { OwnerHubController } from './owner-hub.controller';
import { OwnerHubService } from './owner-hub.service';

@Module({
  imports: [ReportsModule, LineMessagingModule],
  controllers: [OwnerHubController],
  providers: [OwnerHubService],
})
export class OwnerHubModule {}
