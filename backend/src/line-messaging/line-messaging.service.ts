import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as https from 'https';

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
    return new Promise((resolve) => {
      const body = JSON.stringify({
        to: userId,
        messages: [{ type: 'text', text }],
      });
      const req = https.request(
        {
          hostname: 'api.line.me',
          path: '/v2/bot/message/push',
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
            if (!ok) this.logger.warn(`LINE push HTTP ${res.statusCode}: ${resBody.slice(0, 200)}`);
            resolve(ok);
          });
        },
      );
      req.on('error', (e) => {
        this.logger.warn(`LINE push failed: ${e.message}`);
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
      const settings = await this.prisma.shopSettings.findFirst({
        where: tenantId ? { tenantId } : {},
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
    const customer = await this.prisma.customer.findFirst({
      where: {
        ...where,
        phone: { endsWith: digits },
      },
    });
    if (!customer) return false;
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { lineUserId },
    });
    return true;
  }
}
