import {
  Controller,
  Get,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { PublicTrackingService } from './public-tracking.service';

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
