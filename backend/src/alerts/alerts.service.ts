import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export type AlertSeverity = 'CRITICAL' | 'WARNING' | 'INFO';
export type AlertType =
  | 'TRANSFER_PENDING'
  | 'TRANSFER_IN_TRANSIT'
  | 'REPAIR_OVERDUE'
  | 'LOW_STOCK'
  | 'OVERDUE_DEBT';

export interface OperationalAlert {
  id:        string;
  type:      AlertType;
  severity:  AlertSeverity;
  title:     string;
  message:   string;
  actionUrl: string;
  entityId:  string;
  createdAt: string;
}

const SEV_ORDER: Record<AlertSeverity, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
/** Default SLA threshold in days — repairs older than this trigger an alert */
const REPAIR_SLA_DAYS = 7;
/** Repairs this many days over SLA become CRITICAL */
const REPAIR_CRITICAL_DAYS = 14;
/** Max alerts returned per category */
const CAT_LIMIT = 10;

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

  async getOperationalAlerts(branchId: string | null, isPrivileged: boolean): Promise<OperationalAlert[]> {
    const alerts: OperationalAlert[] = [];
    const now = new Date();
    const slaThreshold = new Date(now.getTime() - REPAIR_SLA_DAYS * 86_400_000);

    // ── 1. PENDING transfers — source branch needs to approve ─────────────────
    const pendingXfers = await (this.prisma as any).stockTransfer.findMany({
      where: {
        status: 'PENDING',
        ...(branchId ? { fromBranchId: branchId } : {}),
      },
      include: {
        toBranch: { select: { name: true } },
        product:  { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: CAT_LIMIT,
    });

    for (const t of pendingXfers) {
      const ageHours = (now.getTime() - new Date(t.createdAt).getTime()) / 3_600_000;
      alerts.push({
        id:        `transfer-pending-${t.id}`,
        type:      'TRANSFER_PENDING',
        severity:  ageHours > 24 ? 'WARNING' : 'INFO',
        title:     'มีคำขอโอนสินค้า',
        message:   `${t.toBranch?.name ?? '?'} ขอ ${t.product?.name ?? '?'} จำนวน ${t.quantity} ชิ้น`,
        actionUrl: `/transfers?highlight=${t.id}`,
        entityId:  t.id,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      });
    }

    // ── 2. IN_TRANSIT transfers — destination branch needs to receive ─────────
    const inTransitXfers = await (this.prisma as any).stockTransfer.findMany({
      where: {
        status: 'IN_TRANSIT',
        ...(branchId ? { toBranchId: branchId } : {}),
      },
      include: {
        fromBranch: { select: { name: true } },
        product:    { select: { name: true } },
      },
      orderBy: { createdAt: 'asc' },
      take: CAT_LIMIT,
    });

    for (const t of inTransitXfers) {
      alerts.push({
        id:        `transfer-transit-${t.id}`,
        type:      'TRANSFER_IN_TRANSIT',
        severity:  'WARNING',
        title:     'รอรับสินค้า',
        message:   `${t.product?.name ?? '?'} จาก ${t.fromBranch?.name ?? '?'} กำลังส่งมา`,
        actionUrl: `/transfers?highlight=${t.id}`,
        entityId:  t.id,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      });
    }

    // ── 3. Overdue repairs ────────────────────────────────────────────────────
    const overdueRepairs = await this.prisma.repair.findMany({
      where: {
        receivedAt: { lt: slaThreshold },
        status:     { notIn: ['DELIVERED', 'CANCELLED'] },
        ...(branchId ? { branchId } : {}),
      },
      select: { id: true, ticketNumber: true, receivedAt: true, branchId: true },
      orderBy: { receivedAt: 'asc' },
      take: CAT_LIMIT,
    });

    for (const r of overdueRepairs) {
      const days = Math.floor((now.getTime() - new Date(r.receivedAt ?? now).getTime()) / 86_400_000);
      alerts.push({
        id:        `repair-overdue-${r.id}`,
        type:      'REPAIR_OVERDUE',
        severity:  days >= REPAIR_CRITICAL_DAYS ? 'CRITICAL' : 'WARNING',
        title:     'งานซ่อมค้างเกินกำหนด',
        message:   `งาน #${r.ticketNumber} ค้าง ${days} วัน`,
        actionUrl: `/repairs?highlight=${r.id}`,
        entityId:  r.id,
        createdAt: (r.receivedAt ?? now).toISOString(),
      });
    }

    // ── 4. Low / zero stock in branch ─────────────────────────────────────────
    try {
      type LowStockRow = {
        id: string; branchId: string; productId: string;
        quantity: number; minStock: number; productName: string;
      };
      const lowStocks: LowStockRow[] = branchId
        ? await this.prisma.$queryRaw`
            SELECT bs.id, bs."branchId", bs."productId", bs.quantity, bs."minStock",
                   p.name AS "productName"
            FROM   "BranchStock" bs
            JOIN   "Product" p ON p.id = bs."productId"
            JOIN   "Branch"  b ON b.id = bs."branchId"
            WHERE  bs."minStock" > 0
              AND  bs.quantity <= bs."minStock"
              AND  b."isActive" = true
              AND  bs."branchId" = ${branchId}
            ORDER  BY bs.quantity ASC
            LIMIT  ${CAT_LIMIT}`
        : await this.prisma.$queryRaw`
            SELECT bs.id, bs."branchId", bs."productId", bs.quantity, bs."minStock",
                   p.name AS "productName"
            FROM   "BranchStock" bs
            JOIN   "Product" p ON p.id = bs."productId"
            JOIN   "Branch"  b ON b.id = bs."branchId"
            WHERE  bs."minStock" > 0
              AND  bs.quantity <= bs."minStock"
              AND  b."isActive" = true
            ORDER  BY bs.quantity ASC
            LIMIT  ${CAT_LIMIT}`;

      for (const bs of lowStocks) {
        alerts.push({
          id:        `low-stock-${bs.id}`,
          type:      'LOW_STOCK',
          severity:  bs.quantity === 0 ? 'CRITICAL' : 'WARNING',
          title:     bs.quantity === 0 ? 'สินค้าหมดสต๊อก' : 'สินค้าใกล้หมด',
          message:   `${bs.productName} เหลือ ${bs.quantity} ชิ้น`,
          actionUrl: `/products`,
          entityId:  bs.productId,
          createdAt: new Date().toISOString(),
        });
      }
    } catch { /* non-blocking if BranchStock unavailable */ }

    // ── Sort: CRITICAL first, then WARNING, then INFO; within tier by age ─────
    alerts.sort((a, b) => {
      const sevDiff = (SEV_ORDER[a.severity] ?? 3) - (SEV_ORDER[b.severity] ?? 3);
      if (sevDiff !== 0) return sevDiff;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    return alerts.slice(0, 20);
  }
}
