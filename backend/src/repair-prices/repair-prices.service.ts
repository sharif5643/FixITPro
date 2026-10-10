import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import type { RepairPriceRowDto } from './dto/repair-price.dto';

/** Same spacing and case as typed elsewhere would still match: "iPhone  13 " → "iPhone 13". */
export const clean = (s: string | undefined | null) => (s ?? '').trim().replace(/\s+/g, ' ');
const key = (s: string) => clean(s).toLowerCase();

type Row = { id: string; brand: string; model: string; service: string; price: Prisma.Decimal; costPrice: Prisma.Decimal | null; warrantyDays: number | null; updatedAt: Date };

const toJson = (r: Row, withCost: boolean) => ({
  id: r.id,
  brand: r.brand,
  model: r.model,
  service: r.service,
  price: Number(r.price),
  ...(withCost ? { costPrice: r.costPrice == null ? null : Number(r.costPrice) } : {}),
  warrantyDays: r.warrantyDays,
  updatedAt: r.updatedAt,
});

/**
 * Most specific first: the exact model, then every model of the brand, then any brand.
 * One price per job: a model's own price wins over the brand-wide one.
 */
export function pickPrices<T extends { brand: string; model: string; service: string }>(rows: T[], brand: string, model: string): T[] {
  const b = key(brand);
  const m = key(model);
  const rank = (r: T) => {
    const rb = key(r.brand);
    const rm = key(r.model);
    if (rb === b && rm === m && m) return 0;
    if (rb === b && rm === '' && b) return 1;
    if (rb === '' && rm === '') return 2;
    return -1;
  };
  const best = new Map<string, { row: T; rank: number }>();
  for (const row of rows) {
    const r = rank(row);
    if (r < 0) continue;
    const k = key(row.service);
    const cur = best.get(k);
    if (!cur || r < cur.rank) best.set(k, { row, rank: r });
  }
  return [...best.values()].sort((a, z) => a.rank - z.rank || a.row.service.localeCompare(z.row.service, 'th')).map((v) => v.row);
}

@Injectable()
export class RepairPricesService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string, withCost: boolean, search?: string) {
    const q = clean(search);
    const rows = await this.prisma.repairPrice.findMany({
      where: {
        tenantId,
        ...(q ? { OR: ['brand', 'model', 'service'].map((f) => ({ [f]: { contains: q, mode: 'insensitive' as const } })) } : {}),
      },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { service: 'asc' }],
      take: 2000,
    });
    return rows.map((r) => toJson(r, withCost));
  }

  /** The jobs and prices for one device, for the price check and when a job is taken in. */
  async lookup(tenantId: string, brand: string, model: string, withCost: boolean) {
    const b = clean(brand);
    if (!b) return [];
    const rows = await this.prisma.repairPrice.findMany({
      where: {
        tenantId,
        OR: [
          { brand: { equals: b, mode: 'insensitive' } },
          { brand: '', model: '' },
        ],
      },
    });
    return pickPrices(rows, b, clean(model)).map((r) => toJson(r, withCost));
  }

  /** Brands and models already in the list, for quick-pick buttons. */
  async devices(tenantId: string) {
    const rows = await this.prisma.repairPrice.findMany({
      where: { tenantId, NOT: { brand: '' } },
      select: { brand: true, model: true },
      distinct: ['brand', 'model'],
      orderBy: [{ brand: 'asc' }, { model: 'asc' }],
    });
    const byBrand = new Map<string, string[]>();
    for (const r of rows) {
      const list = byBrand.get(r.brand) ?? [];
      if (r.model) list.push(r.model);
      byBrand.set(r.brand, list);
    }
    return [...byBrand.entries()].map(([brand, models]) => ({ brand, models }));
  }

  /** Adds or updates many rows at once (same brand + model + job → the price is updated). */
  async upsertMany(tenantId: string, rows: RepairPriceRowDto[]) {
    if (!rows.length) throw new BadRequestException('ไม่มีรายการราคา');
    const seen = new Set<string>();
    const cleaned = rows.map((r) => {
      const row = { brand: clean(r.brand), model: clean(r.model), service: clean(r.service) };
      if (!row.service) throw new BadRequestException('กรุณาใส่ชื่องานซ่อม');
      if (!row.brand && row.model) throw new BadRequestException(`ใส่รุ่น "${row.model}" แล้วต้องใส่ยี่ห้อด้วย`);
      const k = [row.brand, row.model, row.service].map(key).join('|');
      if (seen.has(k)) throw new BadRequestException(`รายการซ้ำ: ${[row.brand, row.model, row.service].filter(Boolean).join(' ')}`);
      seen.add(k);
      // Cost and warranty left out = keep what is there (staff screens never send the cost)
      return { ...row, price: r.price, costPrice: r.costPrice, warrantyDays: r.warrantyDays };
    });

    // Case-insensitive match against what is already there, so "iphone 13" updates "iPhone 13"
    const existing = await this.prisma.repairPrice.findMany({ where: { tenantId } });
    const byKey = new Map(existing.map((e) => [[e.brand, e.model, e.service].map(key).join('|'), e]));

    let created = 0;
    let updated = 0;
    await this.prisma.$transaction(async (tx) => {
      for (const r of cleaned) {
        const found = byKey.get([r.brand, r.model, r.service].map(key).join('|'));
        const data = {
          price: r.price,
          ...(r.costPrice !== undefined ? { costPrice: r.costPrice } : {}),
          ...(r.warrantyDays !== undefined ? { warrantyDays: r.warrantyDays } : {}),
        };
        if (found) {
          await tx.repairPrice.update({ where: { id: found.id }, data });
          updated++;
        } else {
          await tx.repairPrice.create({ data: { tenantId, brand: r.brand, model: r.model, service: r.service, ...data } });
          created++;
        }
      }
    });
    return { created, updated };
  }

  async update(tenantId: string, id: string, row: RepairPriceRowDto) {
    const found = await this.prisma.repairPrice.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('ไม่พบรายการราคา');
    const data = { brand: clean(row.brand), model: clean(row.model), service: clean(row.service) };
    if (!data.service) throw new BadRequestException('กรุณาใส่ชื่องานซ่อม');
    if (!data.brand && data.model) throw new BadRequestException('ใส่รุ่นแล้วต้องใส่ยี่ห้อด้วย');
    try {
      return await this.prisma.repairPrice.update({
        where: { id },
        data: {
          ...data,
          price: row.price,
          ...(row.costPrice !== undefined ? { costPrice: row.costPrice } : {}),
          ...(row.warrantyDays !== undefined ? { warrantyDays: row.warrantyDays } : {}),
        },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') throw new BadRequestException('มีราคางานนี้ของรุ่นนี้อยู่แล้ว');
      throw e;
    }
  }

  async remove(tenantId: string, id: string) {
    const { count } = await this.prisma.repairPrice.deleteMany({ where: { id, tenantId } });
    if (!count) throw new NotFoundException('ไม่พบรายการราคา');
    return { ok: true };
  }
}
