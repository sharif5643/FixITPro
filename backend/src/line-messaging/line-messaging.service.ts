import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RedisService } from '../redis/redis.service';
import * as https from 'https';
import { randomInt } from 'crypto';

/** Code a staff member sends to their shop's LINE OA to link it; valid 15 minutes. */
const STAFF_CODE_TTL_SEC = 15 * 60;
const STAFF_CODE_RE = /^FIX-?(\d{6})$/i;
const staffCodeKey = (digits: string) => `line_staff_code:${digits}`;

export interface LineRepairNotifyPayload {
  lineUserId: string;
  ticketNumber: string;
  deviceBrand: string;
  deviceModel: string;
  status: string;
  shopName: string;
  channelAccessToken: string;
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED:         '📋 รับงานซ่อมแล้ว',
  DIAGNOSING:       '🔍 กำลังวินิจฉัยอาการ',
  WAITING_APPROVAL: '💬 รออนุมัติราคาซ่อม',
  APPROVED:         '✅ อนุมัติราคาแล้ว กำลังซ่อม',
  WAITING_PARTS:    '📦 รอสั่งอะไหล่',
  IN_PROGRESS:      '🔧 กำลังซ่อม',
  QC_PENDING:       '🔎 กำลังตรวจสอบ QC',
  COMPLETED:        '✅ ซ่อมเสร็จแล้ว กำลังแจ้งให้มารับ',
  READY_PICKUP:     '🎉 พร้อมรับเครื่องแล้ว! กรุณามารับ',
  DELIVERED:        '📬 ส่งมอบเรียบร้อย ขอบคุณที่ใช้บริการ',
  CANCELLED:        '❌ ยกเลิกงานซ่อม',
};

@Injectable()
export class LineMessagingService {
  private readonly logger = new Logger(LineMessagingService.name);

  constructor(
    private prisma: PrismaService,
    private notif: NotificationsService,
    private redis: RedisService,
  ) {}

  private pushMessage(accessToken: string, userId: string, text: string): Promise<boolean> {
    return this.callLine(accessToken, '/v2/bot/message/push', { to: userId, messages: [{ type: 'text', text }] });
  }

  private replyMessage(accessToken: string, replyToken: string, text: string): Promise<boolean> {
    return this.callLine(accessToken, '/v2/bot/message/reply', { replyToken, messages: [{ type: 'text', text }] });
  }

  private callLine(accessToken: string, path: string, payload: object): Promise<boolean> {
    return new Promise((resolve) => {
      const body = JSON.stringify(payload);
      const req = https.request(
        {
          hostname: 'api.line.me',
          path,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
            'Content-Length': Buffer.byteLength(body),
          },
        },
        (res) => {
          let resBody = '';
          res.on('data', (chunk: Buffer) => { resBody += chunk.toString(); });
          res.on('end', () => {
            const ok = res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300;
            if (!ok) this.logger.warn(`LINE ${path} HTTP ${res.statusCode}: ${resBody.slice(0, 200)}`);
            resolve(ok);
          });
        },
      );
      req.on('error', (e) => {
        this.logger.warn(`LINE ${path} failed: ${e.message}`);
        resolve(false);
      });
      // A slow LINE API must not hold up a sale or repair save
      req.setTimeout(8_000, () => req.destroy(new Error('timeout')));
      req.write(body);
      req.end();
    });
  }

  async notifyRepairStatus(
    repairId: string,
    newStatus: string,
    tenantId: string | null,
  ): Promise<void> {
    try {
      // Only the repair's own shop: without a tenant this used to pick any shop's LINE settings.
      if (!tenantId) return;
      const settings = await this.prisma.shopSettings.findFirst({
        where: { tenantId },
        select: { lineChannelAccessToken: true, lineNotifyEnabled: true, shopName: true },
      });

      if (!settings?.lineNotifyEnabled || !settings.lineChannelAccessToken) return;

      const repair = await this.prisma.repair.findUnique({
        where: { id: repairId },
        select: {
          ticketNumber: true,
          deviceBrand: true,
          deviceModel: true,
          customer: { select: { lineUserId: true, name: true } },
        },
      });

      if (!repair?.customer?.lineUserId) return;

      const label = STATUS_LABEL[newStatus] ?? newStatus;
      const message =
        `[${settings.shopName ?? 'FixITPro'}]\n` +
        `หมายเลขงาน: ${repair.ticketNumber}\n` +
        `เครื่อง: ${repair.deviceBrand} ${repair.deviceModel}\n` +
        `สถานะ: ${label}`;

      const ok = await this.pushMessage(
        settings.lineChannelAccessToken,
        repair.customer.lineUserId,
        message,
      );

      // DB notification log — non-fatal
      await this.notif.notify({
        type:     ok ? 'LINE_NOTIFY_SUCCESS' : 'LINE_NOTIFY_FAILED',
        title:    ok ? 'LINE แจ้งเตือนสำเร็จ' : 'LINE แจ้งเตือนล้มเหลว',
        message:  `${repair.ticketNumber} → ${label}`,
        severity: ok ? 'INFO' : 'WARNING',
        tenantId: tenantId ?? undefined,
      }).catch(() => {});
    } catch (err) {
      this.logger.warn(`LINE notify failed for repair ${repairId}: ${(err as Error).message}`);
    }
  }

  async linkLineUser(lineUserId: string, phone: string, tenantId: string | null): Promise<boolean> {
    const where: any = {};
    if (tenantId) where.tenantId = tenantId;
    const digits = phone.replace(/\D/g, '').slice(-9);
    // Link only when exactly one customer matches; with several (or across shops when no
    // tenant is configured) we cannot know whose repair updates this LINE account should get.
    const matches = await this.prisma.customer.findMany({
      where: {
        ...where,
        phone: { endsWith: digits },
      },
      select: { id: true },
      take: 2,
    });
    if (matches.length !== 1) return false;
    const customer = matches[0];
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { lineUserId },
    });
    return true;
  }

  // ── Staff job alerts ─────────────────────────────────────────────────────────

  /**
   * LINE message to staff members who linked their LINE to this shop's Official Account.
   * Needs the shop's channel access token and "LINE notify" switched on. Never throws.
   */
  async notifyStaff(tenantId: string, userIds: string[], text: string): Promise<number> {
    if (!tenantId || userIds.length === 0) return 0;
    try {
      const settings = await this.prisma.shopSettings.findFirst({
        where: { tenantId },
        select: { lineChannelAccessToken: true, lineNotifyEnabled: true },
      });
      if (!settings?.lineNotifyEnabled || !settings.lineChannelAccessToken) return 0;
      const users = await this.prisma.user.findMany({
        where: { id: { in: userIds }, tenantId, isActive: true, lineNotifyId: { not: null } },
        select: { lineNotifyId: true },
      });
      let sent = 0;
      for (const u of users) {
        if (await this.pushMessage(settings.lineChannelAccessToken, u.lineNotifyId!, text)) sent++;
      }
      return sent;
    } catch (err) {
      this.logger.warn(`LINE staff notify failed (tenant ${tenantId}): ${(err as Error).message}`);
      return 0;
    }
  }

  /** Start linking: a short code the staff member sends to the shop's LINE OA. */
  async createStaffLinkCode(userId: string, tenantId: string) {
    const settings = await this.prisma.shopSettings.findFirst({
      where: { tenantId },
      select: { lineChannelAccessToken: true, lineChannelSecret: true, lineOaId: true, lineNotifyEnabled: true },
    });
    const digits = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.set(staffCodeKey(digits), JSON.stringify({ userId, tenantId }), STAFF_CODE_TTL_SEC);
    const oaId = settings?.lineOaId?.trim() || null;
    return {
      code: `FIX-${digits}`,
      expiresInSec: STAFF_CODE_TTL_SEC,
      oaId,
      addFriendUrl: oaId ? `https://line.me/R/ti/p/${encodeURIComponent(oaId.startsWith('@') ? oaId : `@${oaId}`)}` : null,
      // The shop has to connect its OA (token + secret) for linking and alerts to work
      shopReady: !!(settings?.lineChannelAccessToken && settings?.lineChannelSecret && settings?.lineNotifyEnabled),
    };
  }

  async staffLinkStatus(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { lineNotifyId: true } });
    return { linked: !!u?.lineNotifyId };
  }

  async unlinkStaff(userId: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { lineNotifyId: null } });
    return { linked: false };
  }

  /** The secret that signs this shop's webhook calls, or null when the shop has not set one. */
  async channelSecretOf(tenantId: string): Promise<string | null> {
    const s = await this.prisma.shopSettings.findFirst({ where: { tenantId }, select: { lineChannelSecret: true } });
    return s?.lineChannelSecret?.trim() || null;
  }

  /**
   * A text message sent to this shop's OA: a staff link code links that staff member;
   * a phone number links a customer of this shop (repair status updates).
   */
  async handleShopText(tenantId: string, lineUserId: string, text: string, replyToken?: string) {
    const settings = await this.prisma.shopSettings.findFirst({
      where: { tenantId }, select: { lineChannelAccessToken: true },
    });
    const reply = (msg: string) =>
      replyToken && settings?.lineChannelAccessToken
        ? this.replyMessage(settings.lineChannelAccessToken, replyToken, msg)
        : Promise.resolve(false);

    const code = STAFF_CODE_RE.exec(text.replace(/\s/g, ''));
    if (code) {
      const raw = await this.redis.get(staffCodeKey(code[1]));
      const entry = raw ? (JSON.parse(raw) as { userId: string; tenantId: string }) : null;
      if (!entry || entry.tenantId !== tenantId) {
        await reply('รหัสไม่ถูกต้องหรือหมดอายุแล้ว กรุณากดสร้างรหัสใหม่ในแอป FixITPro');
        return 'bad_code';
      }
      await this.redis.del(staffCodeKey(code[1]));
      const user = await this.prisma.user.findFirst({ where: { id: entry.userId, tenantId }, select: { id: true, name: true } });
      if (!user) return 'bad_code';
      await this.prisma.$transaction([
        // One LINE account alerts one staff member of this shop
        this.prisma.user.updateMany({ where: { tenantId, lineNotifyId: lineUserId, id: { not: user.id } }, data: { lineNotifyId: null } }),
        this.prisma.user.update({ where: { id: user.id }, data: { lineNotifyId: lineUserId } }),
      ]);
      await reply(`เชื่อม LINE กับบัญชี ${user.name} แล้ว ✅\nต่อไปจะได้รับแจ้งเตือนงานซ่อมใหม่ทางนี้`);
      return 'staff_linked';
    }

    const phone = text.replace(/[\s-]/g, '');
    if (/^0[689]\d{8}$/.test(phone)) {
      const ok = await this.linkLineUser(lineUserId, phone, tenantId);
      if (ok) await reply('เชื่อมเบอร์เรียบร้อย จะได้รับแจ้งสถานะงานซ่อมทาง LINE นี้');
      return ok ? 'customer_linked' : 'customer_not_found';
    }
    return 'ignored';
  }
}
