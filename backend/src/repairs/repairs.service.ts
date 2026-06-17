import { randomBytes } from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { WarrantiesService } from '../warranties/warranties.service';
import { CreateRepairDto } from './dto/create-repair.dto';
import { UpdateRepairDto } from './dto/update-repair.dto';
import { AddRepairPartDto } from './dto/add-repair-part.dto';
import { RepairPaymentDto } from './dto/repair-payment.dto';
import { ReversePaymentDto } from './dto/reverse-payment.dto';
import { AdditionalPaymentDto } from './dto/additional-payment.dto';

const REPAIR_INCLUDE = {
  customer: true,
  technician: { select: { id: true, name: true } },
  images: { orderBy: { createdAt: 'asc' as const } },
  parts: {
    include: {
      product: { select: { id: true, name: true, sku: true, stock: true, costPrice: true, price: true } },
      stockMovements: { select: { id: true } },
    },
  },
  additionalPayments: {
    orderBy: { createdAt: 'asc' as const },
    include: { createdBy: { select: { id: true, name: true } } },
  },
  paymentReversals: {
    orderBy: { createdAt: 'asc' as const },
    include: { createdBy: { select: { id: true, name: true } } },
  },
} as const;

@Injectable()
export class RepairsService {
  private readonly logger = new Logger(RepairsService.name);

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private warranties: WarrantiesService,
  ) {}

  private async assertBranchActive(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { status: true },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    if ((branch as any).status !== 'ACTIVE') {
      throw new ForbiddenException('สาขานี้ยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน');
    }
  }

  private generateTicketNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `REP-${dateStr}-${suffix}`;
  }

  private async resolveCustomerId(dto: CreateRepairDto): Promise<string | undefined> {
    if (dto.customerId) return dto.customerId;
    if (!dto.customerName) return undefined;
    if (dto.customerPhone) {
      const existing = await this.prisma.customer.findFirst({ where: { phone: dto.customerPhone } });
      if (existing) return existing.id;
    }
    const created = await this.prisma.customer.create({ data: { name: dto.customerName, phone: dto.customerPhone, tags: [] } });
    return created.id;
  }

  async create(dto: CreateRepairDto, actorId?: string, actorName?: string, branchId?: string) {
    if (branchId) await this.assertBranchActive(branchId);

    const customerId = await this.resolveCustomerId(dto);
    const repair = await this.prisma.repair.create({
      data: {
        ticketNumber: this.generateTicketNumber(),
        customerId,
        technicianId: dto.technicianId,
        deviceBrand: dto.deviceBrand,
        deviceModel: dto.deviceModel,
        deviceColor: dto.deviceColor,
        deviceImei: dto.deviceImei,
        issue: dto.issue,
        accessories: dto.accessories,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        estimateCost: dto.estimateCost,
        deposit: dto.deposit ?? 0,
        note: dto.note,
        branchId: branchId ?? null,
      },
      include: REPAIR_INCLUDE,
    });
    await this.auditLog.log({
      actorId, actorName,
      action: 'REPAIR_CREATED',
      entityType: 'Repair',
      entityId: repair.id,
      afterData: {
        ticketNumber: repair.ticketNumber,
        deviceBrand: dto.deviceBrand,
        deviceModel: dto.deviceModel,
        deviceImei: dto.deviceImei,
      },
    });
    if (dto.technicianId) {
      await this.auditLog.log({
        actorId, actorName,
        action: 'TECHNICIAN_ASSIGNED',
        entityType: 'Repair',
        entityId: repair.id,
        afterData: { technicianId: dto.technicianId, ticketNumber: repair.ticketNumber },
      });
    }
    return repair;
  }

  async findAll(query: { status?: string; customerId?: string; date?: string; branchId?: string }, tenantId?: string | null) {
    const where: any = {};

    if (query.status)     where.status     = query.status;
    if (query.customerId) where.customerId = query.customerId;
    if (query.branchId)   where.branchId   = query.branchId;
    if (tenantId)         where.branch     = { tenantId };

    if (query.date) {
      const start = new Date(query.date);
      const end = new Date(query.date);
      end.setDate(end.getDate() + 1);
      where.receivedAt = { gte: start, lt: end };
    }

    // N-2 FIX: cap list at 200 rows to prevent unbounded queries when a branch
    // has a large backlog. Pagination can be added in a future phase if needed.
    return this.prisma.repair.findMany({
      where,
      include: {
        _count: { select: { images: true } },
        customer: { select: { id: true, name: true, phone: true } },
        technician: { select: { id: true, name: true } },
        parts: { include: { product: { select: { name: true } } } },
      },
      orderBy: { receivedAt: 'desc' },
      take: 200,
    });
  }

  async findOne(id: string, tenantId?: string | null) {
    const where: any = { id };
    if (tenantId) where.branch = { tenantId };
    const repair = await this.prisma.repair.findFirst({
      where,
      include: REPAIR_INCLUDE,
    });

    if (!repair) throw new NotFoundException('Repair not found');
    return repair;
  }

  async addImages(repairId: string, urls: string[]) {
    await this.findOne(repairId);
    return this.prisma.repairImage.createMany({
      data: urls.map((url) => ({ repairId, url })),
    });
  }

  async update(id: string, dto: UpdateRepairDto, actorId?: string, actorName?: string, tenantId?: string | null) {
    const repair = await this.findOne(id, tenantId);

    // PART 6: DELIVERED repairs are locked — payment already processed and shift-linked
    if (repair.status === 'DELIVERED' && dto.status !== undefined) {
      throw new BadRequestException(
        'ไม่สามารถเปลี่ยนสถานะงานซ่อมที่ส่งมอบแล้ว — การชำระเงินถูกบันทึกเรียบร้อยแล้ว',
      );
    }

    // Guard: cannot mark COMPLETED while waiting for approval
    if (dto.status === 'COMPLETED' && repair.status === 'WAITING_APPROVAL') {
      throw new BadRequestException('ต้องได้รับการอนุมัติราคาก่อนจึงจะซ่อมเสร็จได้');
    }

    // Guard: DELIVERED must go through POST /repairs/:id/payment
    if (dto.status === 'DELIVERED') {
      throw new BadRequestException('ต้องชำระเงินก่อนส่งมอบ — ใช้ API /repairs/:id/payment');
    }

    // Guard: CANCELLED repairs cannot be re-opened
    if (repair.status === 'CANCELLED' && dto.status !== undefined && dto.status !== 'CANCELLED') {
      throw new BadRequestException('ไม่สามารถเปลี่ยนสถานะงานซ่อมที่ยกเลิกแล้ว');
    }

    // M-2 FIX: explicit allowed-transitions map replaces the open-ended
    // "any forward move is valid" guard.  Prevents skipping diagnosis or
    // approval (e.g. RECEIVED → COMPLETED which triggered stock deduction
    // without an approval step).
    if (dto.status !== undefined && dto.status !== repair.status && dto.status !== 'CANCELLED') {
      const ALLOWED: Record<string, string[]> = {
        'RECEIVED':         ['DIAGNOSING'],
        'DIAGNOSING':       ['WAITING_APPROVAL', 'APPROVED', 'IN_PROGRESS'],
        // DIAGNOSING→APPROVED: owner pre-approves without estimate (simple repair)
        // DIAGNOSING→IN_PROGRESS: no estimate needed at all
        'WAITING_APPROVAL': ['APPROVED'],
        'APPROVED':         ['WAITING_PARTS', 'IN_PROGRESS'],
        // APPROVED→IN_PROGRESS: skip parts wait if technician already has parts
        'WAITING_PARTS':    ['IN_PROGRESS'],
        'IN_PROGRESS':      ['COMPLETED', 'WAITING_PARTS'],
        // IN_PROGRESS→WAITING_PARTS: more parts discovered during repair
        'COMPLETED':        [],
      };
      const allowed = ALLOWED[repair.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `ไม่สามารถเปลี่ยนสถานะจาก ${repair.status} เป็น ${dto.status} ได้`,
        );
      }
    }

    const updateData: any = {};
    if (dto.status !== undefined) updateData.status = dto.status;
    if (dto.technicianId !== undefined) updateData.technicianId = dto.technicianId;
    if (dto.estimateCost !== undefined) updateData.estimateCost = dto.estimateCost;
    if (dto.finalCost !== undefined) updateData.finalCost = dto.finalCost;
    if (dto.deposit !== undefined) updateData.deposit = dto.deposit;
    if (dto.note !== undefined) updateData.note = dto.note;
    if (dto.estimatedLaborCost !== undefined) updateData.estimatedLaborCost = dto.estimatedLaborCost;
    if (dto.estimatedPartsCost !== undefined) updateData.estimatedPartsCost = dto.estimatedPartsCost;
    if (dto.estimatedTotal !== undefined) updateData.estimatedTotal = dto.estimatedTotal;
    if (dto.approvalNote !== undefined) updateData.approvalNote = dto.approvalNote;
    if (dto.actualLaborCost !== undefined) updateData.actualLaborCost = dto.actualLaborCost;

    if (dto.status === 'COMPLETED') updateData.completedAt = new Date();
    if (dto.status === 'DELIVERED') updateData.deliveredAt = new Date();
    if (dto.status === 'APPROVED') updateData.approvedAt = new Date();

    // Deduct stock for all un-deducted parts when status → COMPLETED
    if (dto.status === 'COMPLETED') {
      const repairBranchId = repair.branchId ?? null;

      // B-4 FIX: Always open a transaction for COMPLETED so the idempotency
      // check (no existing stockMovements) is re-evaluated INSIDE the tx.
      // Concurrent requests both reading `repair.parts` outside would bypass
      // the guard; re-querying inside tx under a write lock prevents double deduction.
      return this.prisma.$transaction(async (tx) => {
        // Re-fetch un-deducted parts inside the transaction for race-safety
        const freshParts = await tx.repairPart.findMany({
          where: {
            repairId: id,
            stockMovements: { none: {} },
          },
          // Include stock for global-path check in first pass (avoids extra queries)
          include: { product: { select: { name: true, stock: true } } },
        });

        // UX-3 FIX: First pass — collect ALL insufficient parts before throwing.
        // Previously failed on the first short part; now the technician sees every
        // shortage in a single message ("Battery (have 0, need 1), Screen (have 1, need 2)").
        const shortages: Array<{ productName: string; available: number; needed: number }> = [];

        for (const part of freshParts) {
          const productName = part.product?.name ?? `[ID: ${part.productId}]`;
          if (repairBranchId) {
            const bs = await (tx as any).branchStock.findUnique({
              where: { branchId_productId: { branchId: repairBranchId, productId: part.productId } },
            });
            const available = bs?.quantity ?? 0;
            if (available < part.quantity) {
              shortages.push({ productName, available, needed: part.quantity });
            }
          } else {
            const available = part.product?.stock ?? 0;
            if (available < part.quantity) {
              shortages.push({ productName, available, needed: part.quantity });
            }
          }
        }

        if (shortages.length > 0) {
          const detail = shortages
            .map(s => `"${s.productName}" (มี ${s.available} ต้องการ ${s.needed})`)
            .join(', ');
          throw new BadRequestException(`สต็อกไม่พอ: ${detail}`);
        }

        // Second pass — deduct (only reached when all parts have sufficient stock)
        for (const part of freshParts) {
            if (repairBranchId) {
              await (tx as any).branchStock.update({
                where: { branchId_productId: { branchId: repairBranchId, productId: part.productId } },
                data: { quantity: { decrement: part.quantity } },
              });
            } else {
              const product = await tx.product.findUnique({ where: { id: part.productId } });
              if (!product) throw new NotFoundException(`Product not found`);
            }

            await tx.product.update({
              where: { id: part.productId },
              data: { stock: { decrement: part.quantity } },
            });

            await tx.stockMovement.create({
              data: {
                productId:    part.productId,
                type:         'REPAIR_USE',
                quantity:     part.quantity,
                repairPartId: part.id,
                branchId:     repairBranchId,
                note:         `Repair ${repair.ticketNumber}`,
              },
            });
          }

          const updated = await tx.repair.update({
            where: { id },
            data: updateData,
            include: REPAIR_INCLUDE,
          });
          await this.auditLog.log({
            actorId, actorName,
            action: 'REPAIR_UPDATED',
            entityType: 'Repair',
            entityId: id,
            afterData: updateData,
          });
          return updated;
        });
    }

    const updated = await this.prisma.repair.update({
      where: { id },
      data: updateData,
      include: REPAIR_INCLUDE,
    });
    await this.auditLog.log({
      actorId, actorName,
      action: 'REPAIR_UPDATED',
      entityType: 'Repair',
      entityId: id,
      afterData: updateData,
    });
    if (
      dto.technicianId !== undefined &&
      dto.technicianId !== repair.technicianId
    ) {
      const action = repair.technicianId ? 'TECHNICIAN_REASSIGNED' : 'TECHNICIAN_ASSIGNED';
      await this.auditLog.log({
        actorId, actorName,
        action,
        entityType: 'Repair',
        entityId: id,
        afterData: {
          technicianId: dto.technicianId,
          previousTechnicianId: repair.technicianId ?? null,
          ticketNumber: repair.ticketNumber,
        },
      });
    }
    return updated;
  }

  async addPart(repairId: string, dto: AddRepairPartDto, tenantId?: string | null) {
    const repair = await this.findOne(repairId, tenantId);

    if (['COMPLETED', 'DELIVERED'].includes(repair.status)) {
      throw new BadRequestException('ไม่สามารถเพิ่มอะไหล่หลังงานซ่อมเสร็จแล้ว');
    }

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');

    // Stock check: branch-scoped if repair has a branch context
    if (repair.branchId) {
      const bs = await (this.prisma as any).branchStock.findUnique({
        where: { branchId_productId: { branchId: repair.branchId, productId: dto.productId } },
      });
      const available = bs?.quantity ?? 0;
      if (available < dto.quantity) {
        throw new BadRequestException(
          `สต็อกสาขาไม่พอสำหรับ "${product.name}" มีอยู่ในสาขา: ${available} ชิ้น`,
        );
      }
    } else if (product.stock < dto.quantity) {
      throw new BadRequestException(
        `สต็อกไม่พอสำหรับ "${product.name}" มีอยู่: ${product.stock} ชิ้น`,
      );
    }

    // Use provided price or fall back to product cost price
    const price = dto.price !== undefined ? dto.price : Number(product.costPrice);

    await this.prisma.repairPart.create({
      data: {
        repairId,
        productId: dto.productId,
        quantity: dto.quantity,
        price,
      },
    });

    return this.findOne(repairId);
  }

  async removePart(repairId: string, partId: string, tenantId?: string | null) {
    const repairWhere: any = { id: repairId };
    if (tenantId) repairWhere.branch = { tenantId };
    const repairStatus = await this.prisma.repair.findFirst({
      where: repairWhere,
      select: { status: true, branchId: true },
    });
    if (!repairStatus) throw new NotFoundException('Repair not found');
    if (['COMPLETED', 'DELIVERED'].includes(repairStatus.status)) {
      throw new BadRequestException('ไม่สามารถลบอะไหล่หลังงานซ่อมเสร็จแล้ว');
    }

    const part = await this.prisma.repairPart.findFirst({
      where: { id: partId, repairId },
      include: { stockMovements: { select: { id: true } } },
    });

    if (!part) throw new NotFoundException('Part not found');

    // If stock was already deducted, reverse it
    if (part.stockMovements.length > 0) {
      await this.prisma.$transaction(async (tx) => {
        const repairBranchId = repairStatus.branchId ?? null;
        await tx.stockMovement.deleteMany({ where: { repairPartId: partId } });
        if (repairBranchId) {
          await (tx as any).branchStock.upsert({
            where: { branchId_productId: { branchId: repairBranchId, productId: part.productId } },
            create: { branchId: repairBranchId, productId: part.productId, quantity: part.quantity, minStock: 0 },
            update: { quantity: { increment: part.quantity } },
          });
        }
        await tx.product.update({
          where: { id: part.productId },
          data: { stock: { increment: part.quantity } },
        });
        await tx.repairPart.delete({ where: { id: partId } });
      });
    } else {
      await this.prisma.repairPart.delete({ where: { id: partId } });
    }

    return this.findOne(repairId);
  }

  async processPayment(repairId: string, dto: RepairPaymentDto, userId: string, tenantId?: string | null) {
    const activeShift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    if (!activeShift) {
      throw new BadRequestException('กรุณาเปิดกะก่อนรับเงิน');
    }

    const repairWhere: any = { id: repairId };
    if (tenantId) repairWhere.branch = { tenantId };
    const repair = await this.prisma.repair.findFirst({
      where: repairWhere,
      select: {
        id: true, status: true, paymentStatus: true,
        estimatedTotal: true, finalCost: true, estimateCost: true, deposit: true,
      },
    });

    if (!repair) throw new NotFoundException('Repair not found');

    if (repair.status !== 'COMPLETED') {
      throw new BadRequestException('งานซ่อมต้องเสร็จก่อนจึงจะรับเงินได้ (status ต้องเป็น COMPLETED)');
    }

    if (repair.paymentStatus === 'PAID') {
      throw new BadRequestException('งานซ่อมนี้ชำระเงินแล้ว');
    }

    const total = dto.finalCost != null
      ? Number(dto.finalCost)
      : Number(repair.estimatedTotal ?? repair.finalCost ?? repair.estimateCost ?? 0);
    const deposit = Number(repair.deposit ?? 0);
    const balance = Math.max(0, total - deposit);

    if (dto.paymentMethod === 'CASH' && dto.amountPaid < balance) {
      throw new BadRequestException(
        `จำนวนเงินน้อยกว่ายอดค้างชำระ (ต้องชำระอีก ${balance} บาท)`,
      );
    }

    const paid = await this.prisma.repair.update({
      where: { id: repairId },
      data: {
        paymentStatus: 'PAID',
        paymentMethod: dto.paymentMethod as any,
        paidAmount: dto.amountPaid,
        paidAt: new Date(),
        status: 'DELIVERED',
        deliveredAt: new Date(),
        finalCost: total,
        paymentShiftId: activeShift.id,
      },
      include: REPAIR_INCLUDE,
    });
    await this.auditLog.log({
      actorId: userId,
      action: 'REPAIR_PAYMENT',
      entityType: 'Repair',
      entityId: repairId,
      afterData: { finalCost: total, paymentMethod: dto.paymentMethod, amountPaid: dto.amountPaid },
    });

    // Auto-create warranty if warrantyDays provided
    if (dto.warrantyDays && dto.warrantyDays > 0) {
      this.warranties
        .createForRepair(repairId, dto.warrantyDays, undefined, userId)
        .catch((e) => this.logger.warn(`warranty creation failed: ${(e as Error).message}`));
    }

    return paid;
  }

  async reversePayment(repairId: string, dto: ReversePaymentDto, userId: string, tenantId?: string | null) {
    const revWhere: any = { id: repairId };
    if (tenantId) revWhere.branch = { tenantId };
    const repair = await this.prisma.repair.findFirst({
      where: revWhere,
      select: { id: true, status: true, paymentStatus: true, paymentMethod: true, paidAmount: true },
    });

    if (!repair) throw new NotFoundException('Repair not found');
    if (repair.status !== 'DELIVERED') {
      throw new BadRequestException('สามารถยกเลิกการชำระเงินได้เฉพาะงานที่ส่งมอบแล้ว');
    }
    if (repair.paymentStatus !== 'PAID') {
      throw new BadRequestException('งานซ่อมนี้ยังไม่ได้ชำระเงิน');
    }

    const reversed = await this.prisma.$transaction(async (tx) => {
      await tx.repairPaymentReversal.create({
        data: {
          repairId,
          amount: repair.paidAmount ?? 0,
          paymentMethod: (repair.paymentMethod ?? 'CASH') as any,
          reason: dto.reason,
          note: dto.note,
          createdById: userId,
        },
      });

      return tx.repair.update({
        where: { id: repairId },
        data: {
          paymentStatus: 'PENDING',
          paymentMethod: null,
          paidAmount: null,
          paidAt: null,
          paymentShiftId: null,
          status: 'COMPLETED',
          deliveredAt: null,
        },
        include: REPAIR_INCLUDE,
      });
    });
    await this.auditLog.log({
      actorId: userId,
      action: 'REPAIR_PAYMENT_REVERSED',
      entityType: 'Repair',
      entityId: repairId,
      afterData: { reason: dto.reason },
    });
    return reversed;
  }

  async addAdditionalPayment(repairId: string, dto: AdditionalPaymentDto, userId: string, tenantId?: string | null) {
    const addPayWhere: any = { id: repairId };
    if (tenantId) addPayWhere.branch = { tenantId };
    const repair = await this.prisma.repair.findFirst({
      where: addPayWhere,
      select: { id: true, status: true },
    });

    if (!repair) throw new NotFoundException('Repair not found');
    if (!['COMPLETED', 'DELIVERED'].includes(repair.status)) {
      throw new BadRequestException('สามารถเพิ่มการชำระเงินได้เฉพาะงานซ่อมที่เสร็จแล้วหรือส่งมอบแล้ว');
    }

    const activeShift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });

    const payment = await this.prisma.repairAdditionalPayment.create({
      data: {
        repairId,
        amount: dto.amount,
        paymentMethod: dto.paymentMethod as any,
        note: dto.note,
        shiftId: activeShift?.id,
        createdById: userId,
      },
    });
    await this.auditLog.log({
      actorId: userId,
      action: 'REPAIR_ADDITIONAL_PAYMENT',
      entityType: 'Repair',
      entityId: repairId,
      afterData: { amount: Number(dto.amount), paymentMethod: dto.paymentMethod },
    });
    return payment;
  }

  async getOutstandingRepairs(branchId?: string, tenantId?: string | null) {
    const where: any = {
      status:        'DELIVERED',
      paymentStatus: { in: ['PENDING', 'PARTIAL'] },
      ...(branchId ? { branchId } : {}),
    };
    if (tenantId) where.branch = { tenantId };
    const repairs = await this.prisma.repair.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        additionalPayments: {
          orderBy: { createdAt: 'asc' as const },
          include: { createdBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: { deliveredAt: 'asc' },
    });

    return repairs.map((r) => ({
      ...r,
      outstandingAmount: Math.max(
        0,
        Number(r.finalCost ?? 0) -
        Number(r.deposit  ?? 0) -
        r.additionalPayments.reduce((sum, p) => sum + Number(p.amount), 0),
      ),
    }));
  }

  async getDeviceHistory(
    imei: string,
    role: string,
    userBranchId: string | null,
    tenantId: string | null,
  ) {
    if (!imei) throw new BadRequestException('IMEI is required');

    const IS_ELEVATED = role === 'OWNER' || role === 'SUPER_ADMIN';

    // C-2 FIX: tenantId is mandatory for every non-SUPER_ADMIN caller.
    // A null tenantId on OWNER/MANAGER/etc. would silently expose all tenants'
    // repair history for that IMEI — reject it immediately.
    // SUPER_ADMIN is a platform role and may intentionally query cross-tenant.
    if (role !== 'SUPER_ADMIN' && !tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    // B-3 FIX: scope results to caller's tenant/branch so cross-tenant data never leaks.
    const where: any = { deviceImei: imei };
    if (tenantId) {
      // Apply tenant filter when we have context (always true for non-SUPER_ADMIN after above guard).
      where.branch = { tenantId };
    }
    // SUPER_ADMIN with no tenantId: intentional cross-tenant search (no filter applied).
    if (!IS_ELEVATED && userBranchId) {
      where.branchId = userBranchId;
    }

    return this.prisma.repair.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true } },
        technician: { select: { id: true, name: true } },
        parts: { include: { product: { select: { name: true, sku: true } } } },
      },
      orderBy: { receivedAt: 'desc' },
    });
  }
}
