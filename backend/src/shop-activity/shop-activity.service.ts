import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LineMessagingService } from '../line-messaging/line-messaging.service';
import { RedisService } from '../redis/redis.service';

/** A shop that sold or took repairs before and has done nothing for this many days is "quiet" */
export const QUIET_DAYS = 3;
const DAY_MS = 86_400_000;

export interface ShopActivity { tenantId: string; lastActivityAt: Date | null }

/**
 * Tells the system admin when a shop that was using the system stops: no bill, no repair, no
 * shift for QUIET_DAYS days. Once per quiet spell (it starts again after the shop is used).
 * Read only on shop data; it writes only the admin's own notification.
 */
@Injectable()
export class ShopActivityService {
  private readonly logger = new Logger(ShopActivityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notif: NotificationsService,
    private readonly line: LineMessagingService,
    private readonly redis: RedisService,
  ) {}

  /** When each shop last sold, took or paid a repair, or opened a shift (null = never) */
  async lastActivity(tenantIds?: string[]): Promise<Map<string, Date | null>> {
    const rows = await this.prisma.$queryRaw<{ id: string; last: Date | null }[]>`
      SELECT t.id,
        GREATEST(
          (SELECT max(s."createdAt") FROM "Sale" s JOIN "Branch" b ON b.id = s."branchId" WHERE b."tenantId" = t.id),
          (SELECT max(r."receivedAt") FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = t.id),
          (SELECT max(r."paidAt") FROM "Repair" r JOIN "Branch" b ON b.id = r."branchId" WHERE b."tenantId" = t.id),
          (SELECT max(sh."openedAt") FROM "Shift" sh JOIN "User" u ON u.id = sh."userId" WHERE u."tenantId" = t.id)
        ) AS last
      FROM "Tenant" t`;
    const want = tenantIds ? new Set(tenantIds) : null;
    return new Map(rows.filter((r) => !want || want.has(r.id)).map((r) => [r.id, r.last]));
  }

  /** Every morning at 10:00 Bangkok */
  @Cron('0 0 10 * * *', { timeZone: 'Asia/Bangkok' })
  async checkQuietShops(now = new Date()) {
    const shops = await this.prisma.tenant.findMany({
      where:  { status: 'ACTIVE' },
      select: { id: true, shopName: true },
    });
    const last = await this.lastActivity(shops.map((s) => s.id));
    const quiet = shops
      .map((s) => ({ ...s, last: last.get(s.id) ?? null }))
      // Never used: nothing to stop (new shops are followed up another way)
      .filter((s) => s.last && now.getTime() - s.last.getTime() >= QUIET_DAYS * DAY_MS);

    const admins = await this.prisma.user.findMany({
      where:  { role: 'SUPER_ADMIN', isActive: true, lineChatId: { not: null } },
      select: { lineChatId: true },
    });
    let alerted = 0;
    for (const s of quiet) {
      const lastDay = s.last!.toISOString().slice(0, 10);
      const key = `shop_quiet:${s.id}:${lastDay}`;
      try {
        if (await this.redis.get(key)) continue;
        await this.redis.set(key, '1', 120 * 24 * 60 * 60);
        const days = Math.floor((now.getTime() - s.last!.getTime()) / DAY_MS);
        const when = s.last!.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
        const title = `ร้าน ${s.shopName} ไม่ได้ใช้ระบบมา ${days} วัน`;
        const message = `ใช้งานครั้งล่าสุด ${when} — ลองโทรถามร้านว่าติดปัญหาอะไรไหม`;
        await this.notif.notify({
          type: 'SHOP_INACTIVE', title, message, severity: 'WARNING',
          entityType: 'Tenant', entityId: `${s.id}:${lastDay}`, tenantId: null,
        } as any);
        for (const a of admins) await this.line.pushCentral(a.lineChatId!, `⚠️ ${title}\n${message}`).catch(() => false);
        alerted++;
      } catch (e) {
        this.logger.warn(`quiet shop alert for ${s.id} failed: ${(e as Error).message}`);
      }
    }
    if (alerted) this.logger.log(`quiet shop alerts sent: ${alerted}`);
    return { quiet: quiet.length, alerted };
  }
}
