import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as https from 'https';
import { centralLine, END_STATUSES, PUSH_STATUSES, siteOrigin } from './line-central';

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
  ) {}

  private pushMessage(accessToken: string, userId: string, text: string): Promise<boolean> {
    return this.callLine(accessToken, '/v2/bot/message/push', { to: userId, messages: [{ type: 'text', text }] });
  }

  /** Answer a message the customer just sent (replies do not count against the push quota). */
  replyMessage(replyToken: string, text: string): Promise<boolean> {
    const { token } = centralLine();
    if (!token || !replyToken) return Promise.resolve(false);
    return this.callLine(token, '/v2/bot/message/reply', { replyToken, messages: [{ type: 'text', text }] });
  }

  /**
   * Answer on FixITPro's account with buttons under the message: tapping one sends its text back
   * as if typed ("dtac 250 เหลือ 1200" to confirm a reading).
   */
  replyWithChoices(replyToken: string, text: string, choices: { label: string; text: string }[]): Promise<boolean> {
    const { token } = centralLine();
    if (!token || !replyToken) return Promise.resolve(false);
    const quickReply = choices.length
      ? { items: choices.slice(0, 13).map((c) => ({ type: 'action', action: { type: 'message', label: c.label.slice(0, 20), text: c.text.slice(0, 300) } })) }
      : undefined;
    return this.callLine(token, '/v2/bot/message/reply', { replyToken, messages: [{ type: 'text', text, ...(quickReply ? { quickReply } : {}) }] });
  }

  /** A message to someone on FixITPro's account who did not just write (counts against the quota). */
  pushCentral(lineUserId: string, text: string): Promise<boolean> {
    const { token } = centralLine();
    if (!token) return Promise.resolve(false);
    return this.pushMessage(token, lineUserId, text);
  }

  /** The bytes of an image someone sent to FixITPro's account (null when it cannot be fetched). */
  fetchContent(messageId: string): Promise<{ data: Buffer; contentType: string } | null> {
    const { token } = centralLine();
    if (!token || !/^\w+$/.test(messageId)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const req = https.get(
        { hostname: 'api-data.line.me', path: `/v2/bot/message/${messageId}/content`, headers: { Authorization: `Bearer ${token}` } },
        (res) => {
          if (!res.statusCode || res.statusCode >= 300) { res.resume(); resolve(null); return; }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (c: Buffer) => {
            size += c.length;
            if (size > 10 * 1024 * 1024) { req.destroy(); resolve(null); return; }
            chunks.push(c);
          });
          res.on('end', () => resolve({ data: Buffer.concat(chunks), contentType: String(res.headers['content-type'] ?? 'image/jpeg') }));
        },
      );
      req.on('error', () => resolve(null));
      req.setTimeout(20_000, () => { req.destroy(); resolve(null); });
    });
  }

  private callLine(accessToken: string, path: string, payload: unknown): Promise<boolean> {
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
      // Customers following this job on FixITPro's LINE account. Kept apart: a problem there must
      // not stop the shop's own LINE notice below.
      this.notifyFollowers(repairId, newStatus).catch((e) =>
        this.logger.warn(`LINE followers of repair ${repairId}: ${(e as Error).message}`));

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

  /** The online receipt's link to a customer who linked LINE with the shop (the shop's own LINE account) */
  async sendReceiptLink(lineUserId: string, tenantId: string | null, r: { receiptNumber: string; total: number; path: string }): Promise<boolean> {
    if (!tenantId) return false;
    const settings = await this.prisma.shopSettings.findFirst({
      where:  { tenantId },
      select: { lineChannelAccessToken: true, lineNotifyEnabled: true, shopName: true },
    });
    if (!settings?.lineNotifyEnabled || !settings.lineChannelAccessToken) return false;
    const text =
      `[${settings.shopName ?? 'FixITPro'}] ใบเสร็จของคุณ\n` +
      `เลขที่: ${r.receiptNumber}\n` +
      `ยอดรวม: ${r.total.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท\n` +
      `ดูใบเสร็จ: ${siteOrigin()}${r.path}`;
    return this.pushMessage(settings.lineChannelAccessToken, lineUserId, text);
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
  // ── FixITPro's LINE account: customers follow one repair ───────────────────

  private statusText(shopName: string | null | undefined, r: { ticketNumber: string; deviceBrand: string; deviceModel: string }, status: string) {
    return (
      `[${shopName ?? 'ร้านซ่อม'}]\n` +
      `หมายเลขงาน: ${r.ticketNumber}\n` +
      `เครื่อง: ${r.deviceBrand} ${r.deviceModel}\n` +
      `สถานะ: ${STATUS_LABEL[status] ?? status}\n` +
      `ดูรายละเอียด: ${siteOrigin()}/track/${encodeURIComponent(r.ticketNumber)}`
    );
  }

  /**
   * "ติดตามงาน REP-…" from the tracking page button: this LINE account now gets the job's status
   * changes. Answered right away with where the job is now.
   */
  async followRepair(lineUserId: string, ticketNumber: string, replyToken?: string): Promise<boolean> {
    const repair = await this.prisma.repair.findUnique({
      where: { ticketNumber },
      select: { id: true, ticketNumber: true, deviceBrand: true, deviceModel: true, status: true, branch: { select: { tenantId: true } } },
    });
    if (!repair) {
      if (replyToken) await this.replyMessage(replyToken, `ไม่พบงานซ่อม ${ticketNumber} กรุณาตรวจเลขงานบนใบรับเครื่อง`);
      return false;
    }
    const tenantId = repair.branch?.tenantId ?? null;
    const shop = tenantId
      ? await this.prisma.shopSettings.findFirst({ where: { tenantId }, select: { shopName: true } })
      : null;
    if (END_STATUSES.has(repair.status)) {
      if (replyToken) await this.replyMessage(replyToken, this.statusText(shop?.shopName, repair, repair.status) + '\n(งานนี้ปิดแล้ว)');
      return false;
    }
    await this.prisma.repairLineFollow.upsert({
      where: { repairId_lineUserId: { repairId: repair.id, lineUserId } },
      create: { repairId: repair.id, lineUserId, tenantId },
      update: {},
    });
    if (replyToken) {
      await this.replyMessage(replyToken, this.statusText(shop?.shopName, repair, repair.status) + '\n\nจะแจ้งที่นี่เมื่อสถานะเปลี่ยน ✅');
    }
    return true;
  }

  /** The customer blocked or left FixITPro's LINE account: stop sending them anything. */
  async unfollowAll(lineUserId: string): Promise<void> {
    await this.prisma.repairLineFollow.deleteMany({ where: { lineUserId } });
  }

  private async notifyFollowers(repairId: string, status: string): Promise<void> {
    const { token } = centralLine();
    if (!token || !PUSH_STATUSES.has(status)) return;
    const followers = await this.prisma.repairLineFollow.findMany({ where: { repairId }, select: { lineUserId: true, tenantId: true } });
    if (!followers.length) return;
    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      select: { ticketNumber: true, deviceBrand: true, deviceModel: true },
    });
    if (!repair) return;
    const tenantId = followers[0].tenantId;
    const shop = tenantId
      ? await this.prisma.shopSettings.findFirst({ where: { tenantId }, select: { shopName: true } })
      : null;
    const text = this.statusText(shop?.shopName, repair, status);
    for (const f of followers) await this.pushMessage(token, f.lineUserId, text);
    // Handed back or cancelled: nothing more to tell
    if (END_STATUSES.has(status)) await this.prisma.repairLineFollow.deleteMany({ where: { repairId } });
  }
}
