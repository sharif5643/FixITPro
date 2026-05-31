import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

const PO_AGING_SELECT = {
  id: true, poNumber: true, orderDate: true, dueDate: true,
  total: true, paidTotal: true, paymentStatus: true, status: true,
} as const;

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  findAll(query: { search?: string; includeInactive?: string }) {
    const isActive = query.includeInactive === 'true' ? undefined : true;
    return this.prisma.supplier.findMany({
      where: {
        isActive,
        name: query.search
          ? { contains: query.search, mode: 'insensitive' as const }
          : undefined,
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  create(dto: CreateSupplierDto) {
    return this.prisma.supplier.create({ data: dto });
  }

  async update(id: string, dto: UpdateSupplierDto) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.supplier.update({ where: { id }, data: { isActive: false } });
  }

  async getStatement(id: string, startDate: string, endDate: string) {
    const supplier = await this.prisma.supplier.findUnique({ where: { id } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const start = new Date(`${startDate}T00:00:00+07:00`);
    const end   = new Date(`${endDate}T00:00:00+07:00`);
    end.setTime(end.getTime() + 24 * 60 * 60 * 1000);
    const today = new Date();

    // Pre-period POs: compute outstanding as of start date
    const prePeriodPos = await this.prisma.purchaseOrder.findMany({
      where: { supplierId: id, orderDate: { lt: start }, status: { not: 'CANCELLED' } },
      select: {
        ...PO_AGING_SELECT,
        payments: { where: { paidAt: { lt: start } }, select: { amount: true } },
      },
    });

    const openingBalance = prePeriodPos.reduce((sum, po) => {
      const paidBefore = po.payments.reduce((s, p) => s + Number(p.amount), 0);
      return sum + Math.max(0, Number(po.total) - paidBefore);
    }, 0);

    // Purchases in period
    const periodPos = await this.prisma.purchaseOrder.findMany({
      where: { supplierId: id, orderDate: { gte: start, lt: end }, status: { not: 'CANCELLED' } },
      select: PO_AGING_SELECT,
    });
    const purchases = periodPos.reduce((sum, po) => sum + Number(po.total), 0);

    // Payments in period
    const periodPayments = await this.prisma.supplierPayment.findMany({
      where: { purchaseOrder: { supplierId: id }, paidAt: { gte: start, lt: end } },
      include: { purchaseOrder: { select: { poNumber: true } } },
      orderBy: { paidAt: 'asc' },
    });
    const paymentsTotal = periodPayments.reduce((sum, p) => sum + Number(p.amount), 0);

    const closingBalance = openingBalance + purchases - paymentsTotal;

    // All outstanding POs (for aging detail)
    const outstandingPos = await this.prisma.purchaseOrder.findMany({
      where: { supplierId: id, status: { not: 'CANCELLED' }, paymentStatus: { not: 'PAID' } },
      select: PO_AGING_SELECT,
      orderBy: { orderDate: 'asc' },
    });

    const outstandingWithAging = outstandingPos.map((po) => {
      const balance = Math.max(0, Number(po.total) - Number(po.paidTotal));
      const effectiveDue = po.dueDate ? new Date(po.dueDate) : null;
      const daysOverdue = effectiveDue
        ? Math.max(0, Math.floor((today.getTime() - effectiveDue.getTime()) / 86_400_000))
        : 0;
      return {
        id: po.id,
        poNumber: po.poNumber,
        orderDate: po.orderDate,
        dueDate: po.dueDate,
        total: Number(po.total),
        paidTotal: Number(po.paidTotal),
        balance,
        paymentStatus: po.paymentStatus,
        status: po.status,
        daysOverdue,
      };
    });

    return {
      supplier,
      period: { startDate, endDate },
      openingBalance,
      purchases,
      payments: paymentsTotal,
      closingBalance,
      outstandingPos: outstandingWithAging,
      paymentHistory: periodPayments.map((p) => ({
        id: p.id,
        amount: Number(p.amount),
        paymentMethod: p.paymentMethod,
        note: p.note,
        paidAt: p.paidAt,
        poNumber: p.purchaseOrder.poNumber,
        purchaseOrderId: p.purchaseOrderId,
      })),
    };
  }

  async getAgingReport() {
    const today = new Date();

    const outstandingPos = await this.prisma.purchaseOrder.findMany({
      where: { status: { not: 'CANCELLED' }, paymentStatus: { not: 'PAID' } },
      select: {
        ...PO_AGING_SELECT,
        supplier: { select: { id: true, name: true, creditDays: true } },
      },
      orderBy: { orderDate: 'asc' },
    });

    type AgingEntry = {
      id: string; name: string; creditDays: number;
      b0to30: number; b31to60: number; b61to90: number; b90plus: number;
      total: number;
    };

    const supplierMap = new Map<string, AgingEntry>();

    for (const po of outstandingPos) {
      const balance = Math.max(0, Number(po.total) - Number(po.paidTotal));
      if (balance <= 0.001) continue;

      const effectiveDue = po.dueDate
        ? new Date(po.dueDate)
        : po.supplier.creditDays > 0
          ? new Date(new Date(po.orderDate).getTime() + po.supplier.creditDays * 86_400_000)
          : new Date(po.orderDate);

      const daysOverdue = Math.max(0, Math.floor((today.getTime() - effectiveDue.getTime()) / 86_400_000));

      const { id, name, creditDays } = po.supplier;
      if (!supplierMap.has(id)) {
        supplierMap.set(id, { id, name, creditDays, b0to30: 0, b31to60: 0, b61to90: 0, b90plus: 0, total: 0 });
      }
      const entry = supplierMap.get(id)!;
      entry.total += balance;

      if (daysOverdue <= 30)       entry.b0to30  += balance;
      else if (daysOverdue <= 60)  entry.b31to60 += balance;
      else if (daysOverdue <= 90)  entry.b61to90 += balance;
      else                          entry.b90plus  += balance;
    }

    const suppliers = Array.from(supplierMap.values())
      .sort((a, b) => b.total - a.total);

    const totals = suppliers.reduce(
      (acc, s) => ({
        total:   acc.total   + s.total,
        b0to30:  acc.b0to30  + s.b0to30,
        b31to60: acc.b31to60 + s.b31to60,
        b61to90: acc.b61to90 + s.b61to90,
        b90plus: acc.b90plus + s.b90plus,
      }),
      { total: 0, b0to30: 0, b31to60: 0, b61to90: 0, b90plus: 0 },
    );

    return { suppliers, totals };
  }
}
