import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { ModulesService } from '../modules/modules.service';
import { MODULE_KEYS } from '../modules/modules.const';
import { ReportsService } from '../reports/reports.service';
import { LineMessagingService } from '../line-messaging/line-messaging.service';
import { siteOrigin } from '../line-messaging/line-central';
import { RedisService } from '../redis/redis.service';
import { bangkokDate } from '../common/bangkok-date';
import { LONG_OPEN_SHIFT_MS } from '../shifts/shifts.service';
import { summaryText, type ActionItems, type BranchMoney, type OwnerToday } from './owner-summary';

const DAY_MS = 24 * 60 * 60 * 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The owner hub ("ห้องเจ้าของร้าน"): today's money for every branch on one page, what is waiting
 * for the owner, and the same summary on the owner's LINE at 21:00.
 *
 * A shop has it only when the super admin switched the module on for that shop: it is in no
 * package, and unlike other modules the owner does not get it just by being the owner.
 *
 * Every figure comes from the same reports the shop already uses (daily close and profit report),
 * so the numbers here always match theirs.
 */
@Injectable()
export class OwnerHubService {
  private readonly logger = new Logger(OwnerHubService.name);

  constructor(
    private prisma: PrismaService,
    private modules: ModulesService,
    private reports: ReportsService,
    private line: LineMessagingService,
    private redis: RedisService,
  ) {}

  async isEnabled(tenantId: string | null | undefined): Promise<boolean> {
    if (!tenantId) return false;
    try {
      return (await this.modules.getEnabledModules(tenantId)).includes(MODULE_KEYS.OWNER_HUB);
    } catch {
      return false; // fail-closed
    }
  }

  async assertEnabled(tenantId: string | null | undefined) {
    if (!(await this.isEnabled(tenantId))) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'MODULE_NOT_ENABLED',
        moduleKey: MODULE_KEYS.OWNER_HUB,
        message: 'ห้องเจ้าของร้านยังไม่ได้เปิดให้ร้านนี้ ติดต่อผู้ดูแลระบบเพื่อขอเปิดใช้งาน',
      });
    }
  }

  // ── Today ──────────────────────────────────────────────────────────────────

  async today(tenantId: string, branchId?: string, now = new Date()): Promise<OwnerToday> {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
    if (branchId && !branches.some((b) => b.id === branchId)) {
      throw new BadRequestException('ไม่พบสาขานี้ในร้านของคุณ');
    }
    const date = bangkokDate(now);
    const scoped = branchId ? branches.filter((b) => b.id === branchId) : branches;
    const [total, perBranch, actions] = await Promise.all([
      this.money(date, tenantId, branchId ?? null, branchId ? scoped[0].name : 'ทุกสาขา'),
      !branchId && branches.length > 1
        ? Promise.all(branches.map((b) => this.money(date, tenantId, b.id, b.name)))
        : Promise.resolve([] as BranchMoney[]),
      this.actions(tenantId, branchId, now),
    ]);
    return { date, total, branches: perBranch, actions };
  }

  private async money(date: string, tenantId: string, branchId: string | null, name: string): Promise<BranchMoney> {
    const [close, profit] = await Promise.all([
      this.reports.getDailyClosingReport(date, branchId ?? undefined, tenantId),
      this.reports.getProfitReport(date, date, branchId ?? undefined, tenantId),
    ]);
    return {
      branchId,
      name,
      revenue: r2(profit.summary.totalRevenue),
      cash: r2(close.revenue.cash),
      transfer: r2(close.revenue.transfer),
      card: r2(close.revenue.card),
      drawerOut: r2(close.drawer.outTotal),
      expenses: r2(profit.expenses.total),
      netProfit: r2(profit.summary.netProfit),
      bills: close.revenue.pos.count,
      repairPayments: close.revenue.repairs.count,
    };
  }

  private async actions(tenantId: string, branchId: string | undefined, now: Date): Promise<ActionItems> {
    const repairScope = branchId ? { branchId } : { branch: { tenantId } };
    const in3Days = new Date(now.getTime() + 3 * DAY_MS);
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const open = { notIn: ['DELIVERED', 'CANCELLED', 'COMPLETED', 'READY_PICKUP'] as any };

    const [shifts, overdueCount, overdue, pickupCount, pickup, debts, pos, outOfStock, lowStock] = await Promise.all([
      this.prisma.shift.findMany({
        where: {
          isActive: true,
          openedAt: { lt: new Date(now.getTime() - LONG_OPEN_SHIFT_MS) },
          user: { tenantId },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true, openedAt: true, user: { select: { name: true } }, branch: { select: { name: true } } },
        orderBy: { openedAt: 'asc' },
      }),
      this.prisma.repair.count({ where: { dueDate: { lt: now }, status: open, ...repairScope } }),
      this.prisma.repair.findMany({
        where: { dueDate: { lt: now }, status: open, ...repairScope },
        select: { id: true, ticketNumber: true, deviceBrand: true, deviceModel: true, dueDate: true, customer: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
        take: 5,
      }),
      this.prisma.repair.count({ where: { status: { in: ['COMPLETED', 'READY_PICKUP'] as any }, completedAt: { lt: weekAgo }, ...repairScope } }),
      this.prisma.repair.findMany({
        where: { status: { in: ['COMPLETED', 'READY_PICKUP'] as any }, completedAt: { lt: weekAgo }, ...repairScope },
        select: { id: true, ticketNumber: true, deviceBrand: true, deviceModel: true, completedAt: true, customer: { select: { name: true } } },
        orderBy: { completedAt: 'asc' },
        take: 5,
      }),
      // The same debt as the "หนี้ค้างชำระ" page: delivered jobs not paid in full
      this.prisma.repair.findMany({
        where: { status: 'DELIVERED', paymentStatus: { in: ['PENDING', 'PARTIAL'] as any }, ...repairScope },
        select: { finalCost: true, deposit: true, paidAmount: true, additionalPayments: { select: { amount: true } } },
      }),
      this.prisma.purchaseOrder.findMany({
        where: {
          dueDate: { lt: in3Days },
          paymentStatus: { not: 'PAID' },
          status: { not: 'CANCELLED' },
          supplier: { tenantId },
          ...(branchId ? { branchId } : {}),
        },
        select: { id: true, poNumber: true, dueDate: true, total: true, paidTotal: true, supplier: { select: { name: true } } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.product.count({ where: { isActive: true, stock: 0, tenantId } }),
      this.prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) AS count FROM "Product" WHERE "isActive" = true AND "stock" > 0 AND "stock" <= "minStock" AND "tenantId" = ${tenantId}`,
    ]);

    const owed = debts
      .map((r) => Number(r.finalCost ?? 0) - Number(r.deposit ?? 0) - Number(r.paidAmount ?? 0)
        - r.additionalPayments.reduce((s, p) => s + Number(p.amount), 0))
      .filter((x) => x > 0.005);
    const poRows = pos
      .map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        supplier: p.supplier.name,
        dueDate: (p.dueDate as Date).toISOString(),
        remaining: r2(Number(p.total) - Number(p.paidTotal ?? 0)),
        overdue: (p.dueDate as Date) < now,
      }))
      .filter((p) => p.remaining > 0.005);

    return {
      longShifts: shifts.map((s) => ({
        id: s.id,
        userName: s.user.name,
        branchName: s.branch?.name ?? null,
        hours: Math.floor((now.getTime() - s.openedAt.getTime()) / 3_600_000),
      })),
      overdueRepairs: {
        count: overdueCount,
        items: overdue.map((r) => ({
          id: r.id, ticketNumber: r.ticketNumber, customer: r.customer?.name ?? null,
          device: `${r.deviceBrand} ${r.deviceModel}`.trim(), dueDate: (r.dueDate as Date).toISOString(),
        })),
      },
      waitingPickup: {
        count: pickupCount,
        items: pickup.map((r) => ({
          id: r.id, ticketNumber: r.ticketNumber, customer: r.customer?.name ?? null,
          device: `${r.deviceBrand} ${r.deviceModel}`.trim(),
          days: Math.floor((now.getTime() - (r.completedAt as Date).getTime()) / DAY_MS),
        })),
      },
      customerDebt: { count: owed.length, total: r2(owed.reduce((a, b) => a + b, 0)) },
      supplierDue: {
        count: poRows.length,
        total: r2(poRows.reduce((a, p) => a + p.remaining, 0)),
        overdue: poRows.filter((p) => p.overdue).length,
        items: poRows.slice(0, 5),
      },
      stock: { outOfStock, lowStock: Number(lowStock[0]?.count ?? 0) },
    };
  }

  // ── LINE ───────────────────────────────────────────────────────────────────

  async lineSettings(userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { lineChatId: true, ownerDailyLine: true } });
    return { linked: !!u?.lineChatId, dailySummary: u?.ownerDailyLine ?? true };
  }

  async setDailySummary(userId: string, on: boolean) {
    await this.prisma.user.update({ where: { id: userId }, data: { ownerDailyLine: on } });
    return this.lineSettings(userId);
  }

  /** The message as it would go out now, to see it or send it to oneself */
  async previewText(tenantId: string): Promise<string> {
    const [t, tenant] = await Promise.all([
      this.today(tenantId),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { shopName: true } }),
    ]);
    return summaryText(t, tenant?.shopName ?? 'ร้าน', siteOrigin());
  }

  async sendToMe(userId: string, tenantId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { lineChatId: true } });
    if (!u?.lineChatId) throw new BadRequestException('ยังไม่ได้เชื่อม LINE กด "เชื่อม LINE ของฉัน" ก่อน');
    const text = await this.previewText(tenantId);
    const sent = await this.line.pushCentral(u.lineChatId, text);
    if (!sent) throw new BadRequestException('ส่ง LINE ไม่สำเร็จ ลองใหม่อีกครั้ง');
    return { sent: true };
  }

  /** Every evening at 21:00 Bangkok: the day's summary to each owner who linked LINE */
  @Cron('0 0 21 * * *', { timeZone: 'Asia/Bangkok' })
  async sendDailySummaries(now = new Date()) {
    const owners = await this.prisma.user.findMany({
      where: {
        role: 'OWNER', isActive: true, ownerDailyLine: true, lineChatId: { not: null },
        tenantId: { not: null }, tenant: { status: 'ACTIVE' },
      },
      select: { id: true, tenantId: true, lineChatId: true },
    });
    const byTenant = new Map<string, typeof owners>();
    for (const o of owners) byTenant.set(o.tenantId!, [...(byTenant.get(o.tenantId!) ?? []), o]);

    const date = bangkokDate(now);
    let sent = 0;
    for (const [tenantId, list] of byTenant) {
      try {
        if (!(await this.isEnabled(tenantId))) continue;
        const text = await this.previewText(tenantId);
        for (const o of list) {
          // Once a day each, even if the job runs twice
          const key = `owner_daily_line:${o.id}:${date}`;
          if (await this.redis.get(key)) continue;
          await this.redis.set(key, '1', 2 * 24 * 60 * 60);
          if (await this.line.pushCentral(o.lineChatId!, text)) sent++;
        }
      } catch (e) {
        this.logger.warn(`owner daily summary for ${tenantId} failed: ${(e as Error).message}`);
      }
    }
    if (sent) this.logger.log(`owner daily summary sent to ${sent} owner(s)`);
    return { sent };
  }
}
