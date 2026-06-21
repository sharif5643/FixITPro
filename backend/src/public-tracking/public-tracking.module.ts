import { Module } from '@nestjs/common';
import { PublicTrackingController } from './public-tracking.controller';
import { PublicTrackingService } from './public-tracking.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PublicTrackingController],
  providers: [PublicTrackingService],
})
export class PublicTrackingModule {}
