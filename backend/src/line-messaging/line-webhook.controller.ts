import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  Logger,
  Req,
  Param,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import * as crypto from 'crypto';
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
    private lineMessaging: LineMessagingService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() body: { events?: LineEvent[] },
    @Headers('x-line-signature') signature: string,
    @Req() req: Request,
  ) {
    // P1-3 FIX: verify HMAC-SHA256 signature before processing any events.
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (secret) {
      const rawBody = (req as any).rawBody as Buffer | undefined;
      if (!rawBody || !signature) {
        this.logger.warn('LINE webhook: missing rawBody or signature header');
        throw new UnauthorizedException('Missing LINE signature');
      }
      const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('base64');
      if (signature !== expected) {
        this.logger.warn('LINE webhook signature mismatch — possible forge attempt');
        throw new UnauthorizedException('Invalid LINE signature');
      }
    } else {
      // Fail closed: without the secret anyone could post fake events and link a LINE account
      // to any customer's phone number, then receive that customer's repair updates.
      this.logger.warn('LINE_CHANNEL_SECRET not set — webhook events rejected');
      throw new UnauthorizedException('LINE webhook is not configured');
    }

    const events = body.events ?? [];

    for (const event of events) {
      const userId = event.source?.userId;
      if (!userId) continue;

      if (event.type === 'follow') {
        await this.handleFollow(userId);
      }

      if (event.type === 'message' && event.message?.type === 'text') {
        const text = event.message.text?.trim() ?? '';
        if (/^0[689]\d{8}$/.test(text.replace(/[\s\-]/g, ''))) {
          await this.handlePhoneLink(userId, text.replace(/[\s\-]/g, ''));
        }
      }
    }

    return { status: 'ok' };
  }

  /**
   * Webhook of one shop's own LINE Official Account (URL shown on Settings → LINE).
   * Verified with that shop's channel secret; staff link codes and customer phone numbers
   * are matched inside that shop only.
   */
  @Post('webhook/:tenantId')
  @HttpCode(200)
  async shopWebhook(
    @Param('tenantId') tenantId: string,
    @Body() body: { events?: LineEvent[] },
    @Headers('x-line-signature') signature: string,
    @Req() req: Request,
  ) {
    const secret = await this.lineMessaging.channelSecretOf(tenantId);
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!secret || !rawBody || !signature) throw new UnauthorizedException('LINE webhook is not configured');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      this.logger.warn(`LINE webhook signature mismatch for tenant ${tenantId}`);
      throw new UnauthorizedException('Invalid LINE signature');
    }
    for (const event of body.events ?? []) {
      const userId = event.source?.userId;
      if (!userId || event.type !== 'message' || event.message?.type !== 'text') continue;
      await this.lineMessaging.handleShopText(tenantId, userId, event.message.text?.trim() ?? '', event.replyToken);
    }
    return { status: 'ok' };
  }

  private async handleFollow(lineUserId: string) {
    this.logger.log(`LINE follow: ${lineUserId}`);
  }

  private async handlePhoneLink(lineUserId: string, phone: string) {
    // P1-4 FIX: use SINGLE_TENANT_ID env var instead of null so the customer
    // lookup is scoped to the correct tenant.
    const tenantId = process.env.SINGLE_TENANT_ID ?? null;
    const linked = await this.lineMessaging.linkLineUser(lineUserId, phone, tenantId);
    if (linked) {
      this.logger.log(`LINE linked: ${lineUserId} → ${phone} (tenantId=${tenantId ?? 'global'})`);
    } else {
      this.logger.warn(`LINE phone not found: ${phone} (tenantId=${tenantId ?? 'global'})`);
    }
  }
}
