import { Controller, Delete, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { LineMessagingService } from './line-messaging.service';

/** A staff member links (or unlinks) their LINE to get job alerts from their shop's OA. */
@UseGuards(JwtAuthGuard)
@Controller('line/staff')
export class LineStaffController {
  constructor(private line: LineMessagingService) {}

  @Get('status')
  status(@CurrentUser('id') userId: string) {
    return this.line.staffLinkStatus(userId);
  }

  @Post('link-code')
  linkCode(@CurrentUser('id') userId: string, @CurrentUser('tenantId') tenantId: string | null) {
    if (!tenantId) return { code: null, shopReady: false };
    return this.line.createStaffLinkCode(userId, tenantId);
  }

  @Delete('link')
  unlink(@CurrentUser('id') userId: string) {
    return this.line.unlinkStaff(userId);
  }
}
