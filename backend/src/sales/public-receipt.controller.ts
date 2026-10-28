import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ThrottlerGuard, Throttle, SkipThrottle } from '@nestjs/throttler';
import { SalesService } from './sales.service';

/** A receipt opened from the QR on the printout or the link sent to LINE: no sign-in */
@SkipThrottle({ default: true, auth_login: true, auth_register: true, auth_change_pwd: true })
@UseGuards(ThrottlerGuard)
@Throttle({ public_tracking: { limit: 120, ttl: 60 * 1000 } })
@Controller('public/receipts')
export class PublicReceiptController {
  constructor(private readonly sales: SalesService) {}

  @Get(':saleId/:token')
  receipt(@Param('saleId') saleId: string, @Param('token') token: string) {
    return this.sales.publicReceipt(saleId, token);
  }
}
