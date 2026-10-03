import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  REPAIR_TYPES, SALE_TYPES, SALE_SCOPES, RepairRule, SaleRule,
  pickRule, repairCommission, round2, saleCommission,
} from './commission.calc';
import { UpdateCommissionConfigDto } from './commission.dto';

/** Partner jobs that never went ahead cost the shop nothing */
const PARTNER_NOT_DONE = ['PENDING_ACCEPTANCE', 'REJECTED', 'CANCELLED', 'RECALLED'] as const;
const STAFF_ROLES = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF'] as const;

export interface CommissionItem {
  kind: 'REPAIR' | 'SALE';
  ref: string;
  date: string;
  label: string;
  base: number;
  commission: number;
  note: string;
}

export interface CommissionRow {
  userId: string;
  name: string;
  role: string;
  repair: { jobs: number; revenue: number; cost: number; commission: number };
  sale:   { units: number; revenue: number; profit: number; commission: number };
  total: number;
  items: CommissionItem[];
}

@Injectable()
export class CommissionService {
  constructor(private prisma: PrismaService) {}

  private period(query: { startDate?: string; endDate?: string }) {
    const day = /^\d{4}-\d{2}-\d{2}$/;
    const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    const startDate = query.startDate && day.test(query.startDate) ? query.startDate : `${today.slice(0, 8)}01`;
    const endDate   = query.endDate && day.test(query.endDate) ? query.endDate : today;
    return {
      startDate, endDate,
      start: new Date(`${startDate}T00:00:00+07:00`),
      end:   new Date(new Date(`${endDate}T00:00:00+07:00`).getTime() + 24 * 3600_000),
    };
  }

  private async shopRules(tenantId: string) {
    const s = await this.prisma.shopSettings.findUnique({
      where: { tenantId },
      select: {
        techCommissionType: true, techCommissionValue: true, techCommissionTypeRates: true,
        saleCommissionType: true, saleCommissionValue: true, saleCommissionScope: true,
      },
    });
    const typeRates: Record<string, number> = {};
    const raw = (s?.techCommissionTypeRates ?? {}) as Record<string, unknown>;
    for (const [tag, v] of Object.entries(raw)) if (Number(v) > 0) typeRates[tag] = Number(v);
    return {
      repair: { type: (s?.techCommissionType ?? 'NONE') as RepairRule['type'], value: Number(s?.techCommissionValue ?? 0), typeRates },
      sale:   { type: (s?.saleCommissionType ?? 'NONE') as SaleRule['type'], value: Number(s?.saleCommissionValue ?? 0) },
      saleScope: (s?.saleCommissionScope ?? 'PHONE') as 'PHONE' | 'ALL',
    };
  }

  private staff(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: { in: [...STAFF_ROLES] } },
      select: {
        id: true, name: true, role: true, isActive: true,
        staffCommission: { select: { repairType: true, repairValue: true, saleType: true, saleValue: true } },
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  // ── Settings ────────────────────────────────────────────────────────────────

  async getConfig(tenantId: string) {
    const rules = await this.shopRules(tenantId);
    const staff = await this.staff(tenantId);
    return {
      repair: rules.repair,
      sale: { ...rules.sale, scope: rules.saleScope },
      staff: staff.filter((u) => u.isActive).map((u) => ({
        userId: u.id, name: u.name, role: u.role,
        repairType:  u.staffCommission?.repairType ?? null,
        repairValue: u.staffCommission?.repairValue != null ? Number(u.staffCommission.repairValue) : null,
        saleType:    u.staffCommission?.saleType ?? null,
        saleValue:   u.staffCommission?.saleValue != null ? Number(u.staffCommission.saleValue) : null,
      })),
    };
  }

  async updateConfig(dto: UpdateCommissionConfigDto, tenantId: string) {
    const isPercent = (t?: string | null) => !!t && t.startsWith('PERCENT');
    const check = (t: string | null | undefined, v: number | null | undefined, who: string) => {
      if (isPercent(t) && Number(v ?? 0) > 100) throw new BadRequestException(`${who}: เปอร์เซ็นต์ต้องไม่เกิน 100`);
    };
    if (dto.repair) check(dto.repair.type, dto.repair.value, 'ค่าคอมงานซ่อม');
    if (dto.sale) check(dto.sale.type, dto.sale.value, 'ค่าคอมการขาย');

    const typeRates: Record<string, number> = {};
    for (const [tag, v] of Object.entries(dto.repair?.typeRates ?? {})) {
      const name = tag.trim().slice(0, 40);
      const amount = Number(v);
      if (!name) continue;
      if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
        throw new BadRequestException(`ค่าคอมประเภท "${name}" ไม่ถูกต้อง`);
      }
      if (amount > 0) typeRates[name] = round2(amount);
    }
    if (Object.keys(typeRates).length > 50) throw new BadRequestException('ตั้งประเภทงานได้ไม่เกิน 50 ประเภท');

    const staffIds = (dto.staff ?? []).map((s) => s.userId);
    if (staffIds.length) {
      const mine = await this.prisma.user.count({ where: { id: { in: staffIds }, tenantId } });
      if (mine !== new Set(staffIds).size) throw new BadRequestException('พบพนักงานที่ไม่ได้อยู่ในร้านนี้');
    }
    for (const s of dto.staff ?? []) {
      check(s.repairType, s.repairValue, 'ค่าคอมงานซ่อมรายคน');
      check(s.saleType, s.saleValue, 'ค่าคอมการขายรายคน');
    }

    await this.prisma.$transaction(async (tx) => {
      const settingsData: Prisma.ShopSettingsUncheckedUpdateInput = {};
      if (dto.repair) {
        settingsData.techCommissionType = dto.repair.type;
        settingsData.techCommissionValue = dto.repair.value ?? 0;
        if (dto.repair.typeRates) settingsData.techCommissionTypeRates = typeRates;
      }
      if (dto.sale) {
        settingsData.saleCommissionType = dto.sale.type;
        settingsData.saleCommissionValue = dto.sale.value ?? 0;
        if (dto.sale.scope) settingsData.saleCommissionScope = dto.sale.scope;
      }
      if (Object.keys(settingsData).length) {
        await tx.shopSettings.upsert({
          where: { tenantId },
          update: settingsData,
          create: { tenantId, ...settingsData } as Prisma.ShopSettingsUncheckedCreateInput,
        });
      }
      for (const s of dto.staff ?? []) {
        const data = {
          repairType:  s.repairType || null,
          repairValue: s.repairType ? (s.repairValue ?? 0) : null,
          saleType:    s.saleType || null,
          saleValue:   s.saleType ? (s.saleValue ?? 0) : null,
        };
        if (!data.repairType && !data.saleType) {
          await tx.staffCommission.deleteMany({ where: { userId: s.userId, tenantId } });
        } else {
          await tx.staffCommission.upsert({
            where: { userId: s.userId },
            update: data,
            create: { tenantId, userId: s.userId, ...data },
          });
        }
      }
    });
    return this.getConfig(tenantId);
  }

  /** Who can be picked as the seller at checkout, and whether the picker is worth showing. */
  async sellers(tenantId: string) {
    const rules = await this.shopRules(tenantId);
    const staff = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, role: { in: [...STAFF_ROLES] } },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    });
    const anyOwn = await this.prisma.staffCommission.count({ where: { tenantId, saleType: { not: null } } });
    return {
      enabled: rules.sale.type !== 'NONE' || anyOwn > 0,
      scope: rules.saleScope,
      sellers: staff,
    };
  }

  // ── Report ──────────────────────────────────────────────────────────────────

  async getReport(query: { startDate?: string; endDate?: string }, tenantId: string) {
    const { startDate, endDate, start, end } = this.period(query);
    const rules = await this.shopRules(tenantId);
    const staff = await this.staff(tenantId);
    const own = new Map(staff.map((u) => [u.id, u.staffCommission]));

    const rows = new Map<string, CommissionRow>();
    const row = (userId: string, name: string, role: string) => {
      let r = rows.get(userId);
      if (!r) {
        r = {
          userId, name, role,
          repair: { jobs: 0, revenue: 0, cost: 0, commission: 0 },
          sale:   { units: 0, revenue: 0, profit: 0, commission: 0 },
          total: 0, items: [],
        };
        rows.set(userId, r);
      }
      return r;
    };

    // Repairs handed over and paid in the period, credited to the assigned technician
    const repairs = await this.prisma.repair.findMany({
      where: {
        technicianId: { not: null },
        status: 'DELIVERED',
        paidAt: { gte: start, lt: end },
        branch: { tenantId },
      },
      select: {
        ticketNumber: true, deviceBrand: true, deviceModel: true, paidAt: true, issueTags: true,
        deposit: true, paidAmount: true,
        technician: { select: { id: true, name: true, role: true } },
        parts: { where: { isVoided: false }, select: { costPrice: true, price: true, quantity: true } },
        additionalPayments: { select: { amount: true } },
        paymentReversals: { select: { amount: true } },
        partnerTransfers: {
          where: { status: { notIn: [...PARTNER_NOT_DONE] } },
          select: { agreedPartnerPrice: true },
        },
      },
    });
    for (const r of repairs) {
      if (!r.technician) continue;
      const collected = Number(r.deposit ?? 0) + Number(r.paidAmount ?? 0)
        + r.additionalPayments.reduce((s, p) => s + Number(p.amount), 0)
        - r.paymentReversals.reduce((s, p) => s + Number(p.amount), 0);
      const partsCost = r.parts.reduce((s, p) => s + Number(p.costPrice ?? p.price) * p.quantity, 0);
      const partnerCost = r.partnerTransfers.reduce((s, t) => s + Number(t.agreedPartnerPrice ?? 0), 0);
      const tags = Array.isArray(r.issueTags) ? (r.issueTags as unknown[]).map(String) : [];
      const o = own.get(r.technician.id);
      const rule = pickRule(rules.repair, o ? { type: o.repairType, value: o.repairValue == null ? null : Number(o.repairValue) } : null);
      const { amount, note } = repairCommission({ collected, partsCost, partnerCost, tags }, rule as RepairRule);

      const target = row(r.technician.id, r.technician.name, r.technician.role);
      target.repair.jobs += 1;
      target.repair.revenue += collected;
      target.repair.cost += partsCost + partnerCost;
      target.repair.commission += amount;
      target.items.push({
        kind: 'REPAIR', ref: r.ticketNumber, date: (r.paidAt ?? new Date()).toISOString(),
        label: `${r.deviceBrand} ${r.deviceModel}`, base: round2(collected), commission: amount,
        note: [note, partnerCost > 0 ? `หักค่าร้านพาร์ทเนอร์ ${round2(partnerCost)}` : ''].filter(Boolean).join(' · '),
      });
    }

    // Product sales in the period, credited to the seller (or the cashier when none was picked)
    const sales = await this.prisma.sale.findMany({
      where: {
        status: { in: ['COMPLETED', 'PARTIAL_REFUND'] },
        createdAt: { gte: start, lt: end },
        branch: { tenantId },
      },
      select: {
        receiptNumber: true, createdAt: true, subtotal: true, discount: true,
        user:   { select: { id: true, name: true, role: true } },
        seller: { select: { id: true, name: true, role: true } },
        items: {
          select: {
            quantity: true, refundedQty: true, total: true, costPrice: true,
            product: { select: { name: true, type: true } },
          },
        },
      },
    });
    for (const s of sales) {
      const person = s.seller ?? s.user;
      const o = own.get(person.id);
      const rule = pickRule(rules.sale, o ? { type: o.saleType, value: o.saleValue == null ? null : Number(o.saleValue) } : null) as SaleRule;
      if (rule.type === 'NONE') continue;
      const subtotal = Number(s.subtotal);
      // The bill discount is shared across the items in proportion to their price
      const billRatio = subtotal > 0 ? Math.min(1, Math.max(0, (subtotal - Number(s.discount ?? 0)) / subtotal)) : 1;
      for (const it of s.items) {
        if (rules.saleScope === 'PHONE' && it.product.type !== 'PHONE') continue;
        const qty = it.quantity - (it.refundedQty ?? 0);
        if (qty <= 0) continue;
        const revenue = (Number(it.total) / it.quantity) * qty * billRatio;
        const cost = Number(it.costPrice) * qty;
        const { amount, note } = saleCommission({ qty, revenue, cost }, rule);
        if (amount <= 0 && revenue <= 0) continue;

        const target = row(person.id, person.name, person.role);
        target.sale.units += qty;
        target.sale.revenue += revenue;
        target.sale.profit += revenue - cost;
        target.sale.commission += amount;
        target.items.push({
          kind: 'SALE', ref: s.receiptNumber, date: s.createdAt.toISOString(),
          label: qty > 1 ? `${it.product.name} × ${qty}` : it.product.name,
          base: round2(revenue), commission: amount, note,
        });
      }
    }

    const list = [...rows.values()].map((r) => {
      const repair = { jobs: r.repair.jobs, revenue: round2(r.repair.revenue), cost: round2(r.repair.cost), commission: round2(r.repair.commission) };
      const sale = { units: r.sale.units, revenue: round2(r.sale.revenue), profit: round2(r.sale.profit), commission: round2(r.sale.commission) };
      return {
        ...r, repair, sale,
        total: round2(repair.commission + sale.commission),
        items: r.items.sort((a, b) => a.date.localeCompare(b.date)),
      };
    }).sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    return {
      startDate, endDate,
      repairRule: rules.repair,
      saleRule: { ...rules.sale, scope: rules.saleScope },
      rows: list,
      totals: {
        repair: round2(list.reduce((s, r) => s + r.repair.commission, 0)),
        sale:   round2(list.reduce((s, r) => s + r.sale.commission, 0)),
        total:  round2(list.reduce((s, r) => s + r.total, 0)),
      },
    };
  }
}

export { REPAIR_TYPES, SALE_TYPES, SALE_SCOPES };
