import {
  Controller,
  Get,
  Query,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { PublicTrackingService } from './public-tracking.service';

// RC2-002: public_tracking throttler — enforced only on this controller.
// The global default (300/min) is skipped; 200/min covers realistic customer usage
// including repeated refreshes and QR scans.
// The plain ThrottlerGuard runs every named throttler, so the auth ones must be skipped
// too — otherwise auth_register (3/hour) capped a customer at 3 lookups per hour.
@SkipThrottle({ default: true, auth_login: true, auth_register: true, auth_change_pwd: true })
@UseGuards(ThrottlerGuard)
@Throttle({ public_tracking: { limit: 200, ttl: 60 * 1000 } })
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
