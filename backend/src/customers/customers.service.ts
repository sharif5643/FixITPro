import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateCustomerDto } from './dto/create-customer.dto';

export const HIGH_VALUE_CUSTOMER_THRESHOLD = 50_000;

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    private tenantSvc: TenantService,
  ) {}

  async create(dto: CreateCustomerDto, actorId?: string, actorName?: string, tenantId?: string | null) {
    if (dto.phone) {
      const existing = await this.prisma.customer.findFirst({
        where: { phone: dto.phone, ...this.tenantSvc.scope(tenantId) },
      });
      if (existing) throw new ConflictException('Phone number already registered');
    }

    const customer = await this.prisma.customer.create({
      data: { ...dto, ...this.tenantSvc.scope(tenantId) },
    });

    await this.auditLog.log({
      actorId, actorName,
      action:     'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId:   customer.id,
      afterData:  { name: customer.name, phone: customer.phone },
    });

    return customer;
  }

  async findAll(query: { search?: string; tenantId?: string | null }) {
    const where: any = { ...this.tenantSvc.scope(query.tenantId) };

    if (query.search) {
      where.OR = [
        { name:  { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search } },
        { email: { contains: query.search, mode: 'insensitive' } },
        {
          repairs: {
            some: {
              OR: [
                { deviceBrand: { contains: query.search, mode: 'insensitive' } },
                { deviceModel: { contains: query.search, mode: 'insensitive' } },
              ],
            },
          },
        },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { sales: true, repairs: true } },
        sales: {
          where:   { status: 'COMPLETED' },
          select:  { total: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async findOne(id: string, tenantId?: string | null) {
    const [customer, spending, unpaidRepairs, lastSale, lastRepair, notes] =
      await Promise.all([
        this.prisma.customer.findFirst({
          where: { id, ...this.tenantSvc.scope(tenantId) },
          include: {
            _count: { select: { sales: true, repairs: true } },
            sales: {
              take:    30,
              orderBy: { createdAt: 'desc' },
              select: {
                id: true, receiptNumber: true, total: true,
                status: true, paymentMethod: true, createdAt: true,
              },
            },
            repairs: {
              take:    30,
              orderBy: { receivedAt: 'desc' },
              where:   tenantId ? { branch: { tenantId } } : undefined,
              select: {
                id: true, ticketNumber: true, deviceBrand: true,
                deviceModel: true, status: true, receivedAt: true,
                finalCost: true, paidAmount: true, paymentStatus: true,
              },
            },
          },
        }),
        this.prisma.sale.aggregate({
          where: { customerId: id, status: 'COMPLETED' },
          _sum:  { total: true },
        }),
        // Unpaid delivered repairs
        this.prisma.repair.findMany({
          where: {
            customerId:    id,
            status:        'DELIVERED',
            paymentStatus: 'PENDING',
          },
          include: { additionalPayments: { select: { amount: true } } },
        }),
        this.prisma.sale.findFirst({
          where:   { customerId: id },
          orderBy: { createdAt: 'desc' },
          select:  { createdAt: true },
        }),
        this.prisma.repair.findFirst({
          where:   { customerId: id },
          orderBy: { receivedAt: 'desc' },
          select:  { receivedAt: true },
        }),
        this.prisma.customerNote.findMany({
          where:   { customerId: id },
          orderBy: { createdAt: 'desc' },
          take:    50,
        }),
      ]);

    if (!customer) throw new NotFoundException('Customer not found');

    const unpaidBalance = unpaidRepairs.reduce((sum, r) => {
      const paid = r.additionalPayments.reduce(
        (s, p) => s + Number(p.amount), 0,
      );
      return sum + Math.max(
        0,
        Number(r.finalCost ?? 0) - Number((r as any).deposit ?? 0) - paid,
      );
    }, 0);

    const dates = [lastSale?.createdAt, lastRepair?.receivedAt].filter(
      Boolean,
    ) as Date[];
    const lastVisitAt =
      dates.length > 0
        ? new Date(Math.max(...dates.map((d) => d.getTime())))
        : null;

    return {
      ...customer,
      totalSpending: Number(spending._sum.total ?? 0),
      unpaidBalance,
      lastVisitAt,
      notes,
    };
  }

  async update(
    id: string,
    dto: Partial<CreateCustomerDto>,
    actorId?: string,
    actorName?: string,
    tenantId?: string | null,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const updated = await this.prisma.customer.update({
      where: { id },
      data:  dto,
    });

    await this.auditLog.log({
      actorId, actorName,
      action:     'CUSTOMER_UPDATED',
      entityType: 'Customer',
      entityId:   id,
      afterData:  { ...dto },
    });

    return updated;
  }

  async updateTags(id: string, tags: string[], tenantId?: string | null) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({ where: { id }, data: { tags } });
  }

  async addNote(
    customerId: string,
    note: string,
    createdById?: string,
    createdByName?: string,
    tenantId?: string | null,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...this.tenantSvc.scope(tenantId) },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const created = await this.prisma.customerNote.create({
      data: { customerId, note, createdById, createdByName },
    });

    await this.auditLog.log({
      actorId:    createdById,
      actorName:  createdByName,
      action:     'CUSTOMER_NOTE_ADDED',
      entityType: 'Customer',
      entityId:   customerId,
      afterData:  { note: note.slice(0, 200) },
    });

    return created;
  }

  async getNotes(customerId: string, tenantId?: string | null) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, ...this.tenantSvc.scope(tenantId) },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    return this.prisma.customerNote.findMany({
      where:   { customerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getDebtSummary(tenantId?: string | null) {
    const outstandingRepairs = await this.prisma.repair.findMany({
      where: {
        status:        'DELIVERED',
        paymentStatus: { in: ['PENDING', 'PARTIAL'] },
        ...this.tenantSvc.branchScope(tenantId),
      },
      include: {
        customer:           { select: { id: true, name: true, phone: true } },
        additionalPayments: { select: { amount: true } },
      },
    });

    const customerMap = new Map<
      string,
      {
        customerId:  string;
        name:        string;
        phone:       string | null;
        totalDebt:   number;
        repairCount: number;
      }
    >();

    for (const repair of outstandingRepairs) {
      if (!repair.customerId || !repair.customer) continue;
      const paid = repair.additionalPayments.reduce(
        (sum, p) => sum + Number(p.amount), 0,
      );
      const debt = Math.max(
        0,
        Number(repair.finalCost ?? 0) - Number((repair as any).deposit ?? 0) - paid,
      );

      const existing = customerMap.get(repair.customerId);
      if (existing) {
        existing.totalDebt   += debt;
        existing.repairCount += 1;
      } else {
        customerMap.set(repair.customerId, {
          customerId:  repair.customerId,
          name:        repair.customer.name,
          phone:       repair.customer.phone,
          totalDebt:   debt,
          repairCount: 1,
        });
      }
    }

    return Array.from(customerMap.values()).sort(
      (a, b) => b.totalDebt - a.totalDebt,
    );
  }
}
