import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { PublicTrackingService } from './public-tracking.service';

// RC2-002: public_tracking throttler (60 req/min) — enforced only on this controller.
// The global default (300/min) is skipped here; public_tracking is more restrictive
// for this unauthenticated endpoint.
@SkipThrottle({ default: true })
@UseGuards(ThrottlerGuard)
@Throttle({ public_tracking: { limit: 60, ttl: 60 * 1000 } })
@Controller('public/tracking')
export class PublicTrackingController {
  constructor(private readonly svc: PublicTrackingService) {}

  @Get('repair')
  track(
    @Query('ticketNumber') ticketNumber?: string,
    @Query('phone') phone?: string,
  ) {
    if (ticketNumber?.trim()) {
      // ticket (+ optional phone verification)
      return this.svc.trackRepair(ticketNumber, phone);
    }
    if (phone?.trim()) {
      // phone-only → list of repairs
      return this.svc.searchByPhone(phone);
    }
    throw new BadRequestException('กรุณาระบุเลขใบซ่อมหรือหมายเลขโทรศัพท์');
  }
}
