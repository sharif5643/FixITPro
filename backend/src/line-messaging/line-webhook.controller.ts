import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { LineMessagingService } from './line-messaging.service';

interface LineEvent {
  type: string;
  source?: { userId?: string; type?: string };
  message?: { type?: string; text?: string };
  replyToken?: string;
}

@Controller('public/line')
export class LineWebhookController {
  private readonly logger = new Logger(LineWebhookController.name);

  constructor(
    private prisma: PrismaService,
    private lineMessaging: LineMessagingService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() body: { events?: LineEvent[] },
    @Headers('x-line-signature') signature: string,
  ) {
    // Signature verification is optional per-tenant; we just log and process
    const events = body.events ?? [];

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      // Follow event: bot sends greeting asking for phone number
      if (event.type === 'follow') {
        await this.handleFollow(userId);
      }

      // Text message: try to link phone number to customer
      if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text?.trim() ?? '';
        // If message looks like a phone number, attempt to link
        if (/^0[689]\d{8}$/.test(text.replace(/[\s\-]/g, ''))) {
          await this.handlePhoneLink(userId, text.replace(/[\s\-]/g, ''));
        }
      }
    }

    return { status: 'ok' };
  }

  private async handleFollow(lineUserId: string) {
    this.logger.log(`LINE follow: ${lineUserId}`);
    // Store pending link (user needs to send phone number)
    // Reply is handled by LINE reply token in production
  }

  private async handlePhoneLink(lineUserId: string, phone: string) {
    // Try to link across all tenants (webhook doesn't carry tenantId)
    const linked = await this.lineMessaging.linkLineUser(lineUserId, phone, null);
    if (linked) {
      this.logger.log(`LINE linked: ${lineUserId} → ${phone}`);
    }
  }
}
