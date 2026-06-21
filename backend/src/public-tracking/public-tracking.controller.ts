import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { PublicTrackingService } from './public-tracking.service';

@Controller('public/tracking')
export class PublicTrackingController {
  constructor(private readonly svc: PublicTrackingService) {}

  @Throttle({ auth_login: { ttl: 60_000, limit: 10 } })
  @UseGuards(ThrottlerGuard)
  @Get('repair')
  track(
    @Query('ticketNumber') ticketNumber: string,
    @Query('phone') phone: string,
  ) {
    return this.svc.trackRepair(ticketNumber, phone);
  }
}
