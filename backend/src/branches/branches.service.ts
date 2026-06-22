import { randomBytes } from 'crypto';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { SetBranchStockDto } from './dto/set-branch-stock.dto';

@Injectable()
export class BranchesService implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    private tenantSvc: TenantService,
  ) {}

  async onModuleInit() {
    await this.backfillBranchNumbers();
    await this.backfillStockCodes();
  }

  // ── Transfer number ─────────────────────────────────────────────────────────

  private generateTransferNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `TRF-${dateStr}-${suffix}`;
  }

  // ── Stock-code helpers ───────────────────────────────────────────────────────

  private async backfillBranchNumbers() {
    const unassigned = await this.prisma.branch.findMany({
      where: { branchNumber: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (unassigned.length === 0) return;

    const maxRow = await this.prisma.branch.findFirst({
      where: { branchNumber: { not: null } },
      orderBy: { branchNumber: 'desc' },
      select: { branchNumber: true },
    });
    let next = (maxRow?.branchNumber ?? 0) + 1;

    for (const { id } of unassigned) {
      await this.prisma.branch.update({
        where: { id },
        data: { branchNumber: next++ },
      });
    }
  }

  private async backfillStockCodes() {
    const uncodesStocks: any[] = await this.prisma.branchStock.findMany({
      where: { stockCode: null },
      include: { branch: { select: { id: true, branchNumber: true, stockCodeSeq: true } } },
      orderBy: { updatedAt: 'asc' },
    });
    if (uncodesStocks.length === 0) return;

    // Group by branch
    const byBranch = new Map<string, any[]>();
    for (const s of uncodesStocks) {
      const list = byBranch.get(s.branchId) ?? [];
      list.push(s);
      byBranch.set(s.branchId, list);
    }

    for (const [branchId, items] of byBranch) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { branchNumber: true, stockCodeSeq: true },
      });
      if (!branch?.branchNumber) continue;

      let seq = branch.stockCodeSeq;
      for (const item of items) {
        seq++;
        const code = `SK${branch.branchNumber}-${String(seq).padStart(6, '0')}`;
        await this.prisma.branchStock.update({
          where: { id: item.id },
          data: { stockCode: code },
        });
      }
      await this.prisma.branch.update({
        where: { id: branchId },
        data: { stockCodeSeq: seq },
      });

      this.auditLog.log({
        action: 'BRANCH_STOCK_CODE_GENERATED',
        entityType: 'Branch',
        entityId: branchId,
        afterData: { generated: items.length, lastSeq: seq },
      });
    }
  }

  private async generateStockCode(branchId: string, tx?: any): Promise<string | null> {
    const db = tx ?? this.prisma;
    const branch = await db.branch.update({
      where: { id: branchId },
      data: { stockCodeSeq: { increment: 1 } },
      select: { branchNumber: true, stockCodeSeq: true },
    });
    if (!branch.branchNumber) return null;
    return `SK${branch.branchNumber}-${String(branch.stockCodeSeq).padStart(6, '0')}`;
  }

  async getNextStockCode(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { branchNumber: true, stockCodeSeq: true },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    if (!branch.branchNumber) throw new BadRequestException('สาขานี้ยังไม่มีหมายเลขสาขา');
    const nextSeq = branch.stockCodeSeq + 1;
    return {
      nextCode:    `SK${branch.branchNumber}-${String(nextSeq).padStart(6, '0')}`,
      branchNumber: branch.branchNumber,
      nextSeq,
    };
  }

  // ── Branches CRUD ───────────────────────────────────────────────────────────

  async findAll(tenantId: string | null, includeInactive = false) {
    return this.prisma.branch.findMany({
      where: {
        ...this.tenantSvc.scope(tenantId),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      include: {
        _count: { select: { users: true, sales: true, repairs: true } },
      },
    });
  }

  async findOne(id: string, tenantId?: string | null) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
      include: {
        _count: { select: { users: true, sales: true, repairs: true } },
      },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    return branch;
  }

  async create(dto: CreateBranchDto, actorId?: string, actorName?: string, tenantId?: string | null) {
    if (dto.isDefault) {
      await this.prisma.branch.updateMany({
        where: tenantId ? { tenantId } : {},
        data: { isDefault: false },
      });
    }

    // Auto-assign next branchNumber scoped to this tenant
    const maxRow = await this.prisma.branch.findFirst({
      where: { branchNumber: { not: null }, ...this.tenantSvc.scope(tenantId) },
      orderBy: { branchNumber: 'desc' },
      select: { branchNumber: true },
    });
    const branchNumber = (maxRow?.branchNumber ?? 0) + 1;

    const branch = await this.prisma.branch.create({
      data: { ...dto, branchNumber, status: 'ACTIVE', ...(tenantId ? { tenantId } : {}) },
    });

    this.auditLog.log({
      actorId, actorName, action: 'BRANCH_REQUESTED',
      entityType: 'Branch', entityId: branch.id,
      afterData: { name: branch.name, isDefault: branch.isDefault, branchNumber, status: 'ACTIVE' },
    });

    try {
      await this.notif.notify({
        type:       'BRANCH_APPROVAL_REQUESTED',
        title:      `สาขาใหม่รอการอนุมัติ: ${branch.name}`,
        message:    `มีการสร้างสาขา "${branch.name}" กรุณาตรวจสอบและอนุมัติ`,
        severity:   'INFO',
        entityType: 'Branch',
        entityId:   branch.id,
      });
    } catch { /* non-blocking */ }

    return branch;
  }

  async update(id: string, dto: UpdateBranchDto, actorId?: string, actorName?: string, tenantId?: string | null) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');

    if (dto.isDefault) {
      await this.prisma.branch.updateMany({
        where: { id: { not: id }, ...this.tenantSvc.scope(tenantId) },
        data: { isDefault: false },
      });
    }

    const updated = await this.prisma.branch.update({ where: { id }, data: dto });

    this.auditLog.log({
      actorId, actorName, action: 'BRANCH_UPDATED',
      entityType: 'Branch', entityId: id,
      beforeData: { name: branch.name, isActive: branch.isActive },
      afterData: { name: updated.name, isActive: updated.isActive },
    });

    return updated;
  }

  async deactivate(id: string, actorId?: string, actorName?: string, tenantId?: string | null) {
    const branch = await this.prisma.branch.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    if (branch.isDefault) throw new BadRequestException('ไม่สามารถปิดใช้งานสาขาหลักได้');

    const updated = await this.prisma.branch.update({
      where: { id },
      data: { isActive: false },
    });

    this.auditLog.log({
      actorId, actorName, action: 'BRANCH_UPDATED',
      entityType: 'Branch', entityId: id,
      afterData: { isActive: false },
    });

    return updated;
  }

  // ── Branch Approval ─────────────────────────────────────────────────────────

  async approveBranch(id: string, actorId?: string, actorName?: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    if (branch.status === 'ACTIVE') throw new BadRequestException('สาขานี้ได้รับการอนุมัติแล้ว');

    const updated = await this.prisma.branch.update({
      where: { id },
      data: { status: 'ACTIVE', isActive: true },
    });

    this.auditLog.log({
      actorId, actorName, action: 'BRANCH_APPROVED',
      entityType: 'Branch', entityId: id,
      afterData: { status: 'ACTIVE', approvedBy: actorName },
    });

    try {
      await this.notif.notify({
        type:       'BRANCH_APPROVED',
        title:      `สาขาได้รับการอนุมัติ: ${branch.name}`,
        message:    `สาขา "${branch.name}" ได้รับการอนุมัติจาก ${actorName ?? 'ผู้ดูแลระบบ'} แล้ว`,
        severity:   'INFO',
        entityType: 'Branch',
        entityId:   id,
      });
    } catch { /* non-blocking */ }

    return updated;
  }

  async rejectBranch(id: string, reason: string, actorId?: string, actorName?: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');

    const updated = await this.prisma.branch.update({
      where: { id },
      data: { status: 'REJECTED', isActive: false },
    });

    this.auditLog.log({
      actorId, actorName, action: 'BRANCH_REJECTED',
      entityType: 'Branch', entityId: id,
      afterData: { status: 'REJECTED', reason, rejectedBy: actorName },
    });

    try {
      await this.notif.notify({
        type:       'BRANCH_REJECTED',
        title:      `สาขาถูกปฏิเสธ: ${branch.name}`,
        message:    `สาขา "${branch.name}" ถูกปฏิเสธ — ${reason}`,
        severity:   'WARNING',
        entityType: 'Branch',
        entityId:   id,
      });
    } catch { /* non-blocking */ }

    return updated;
  }

  async suspendBranch(id: string, reason: string, actorId?: string, actorName?: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id } });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');

    const updated = await this.prisma.branch.update({
      where: { id },
      data: { status: 'SUSPENDED', isActive: false },
    });

    this.auditLog.log({
      actorId, actorName, action: 'BRANCH_SUSPENDED',
      entityType: 'Branch', entityId: id,
      afterData: { status: 'SUSPENDED', reason, suspendedBy: actorName },
    });

    return updated;
  }

  // ── Branch Stock ────────────────────────────────────────────────────────────

  async getBranchStock(branchId: string, tenantId: string | null | undefined, query?: { search?: string }) {
    await this.findOne(branchId, tenantId);

    return this.prisma.branchStock.findMany({
      where: {
        branchId,
        ...(query?.search
          ? {
              product: {
                OR: [
                  { name: { contains: query.search, mode: 'insensitive' } },
                  { sku: { contains: query.search, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, type: true, price: true, isActive: true },
        },
      },
      orderBy: { product: { name: 'asc' } },
    });
  }

  private async syncProductShadowStock(productId: string, tx?: Prisma.TransactionClient): Promise<number> {
    const db = tx ?? this.prisma;
    const result = await db.branchStock.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const total = (result._sum.quantity as number | null) ?? 0;
    await db.product.update({ where: { id: productId }, data: { stock: total } });
    return total;
  }

  async setBranchStock(branchId: string, dto: SetBranchStockDto, actorId?: string, actorName?: string, tenantId?: string | null) {
    const branch = await this.findOne(branchId, tenantId);
    if (branch.status !== 'ACTIVE') {
      throw new ForbiddenException('สาขานี้ยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน');
    }

    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('ไม่พบสินค้า');
    if (tenantId && product.tenantId !== tenantId) {
      throw new ForbiddenException('สินค้านี้ไม่ได้อยู่ใน tenant ของสาขา');
    }

    // Check if record already exists (needed for stock-code generation)
    const existing = await this.prisma.branchStock.findUnique({
      where: { branchId_productId: { branchId, productId: dto.productId } },
    });

    // Generate stock code only for new records
    let stockCode: string | null = null;
    if (!existing) {
      stockCode = await this.generateStockCode(branchId);
    }

    const stock = await this.prisma.branchStock.upsert({
      where: { branchId_productId: { branchId, productId: dto.productId } },
      create: {
        branchId,
        productId: dto.productId,
        quantity:  dto.quantity,
        minStock:  dto.minStock ?? 0,
        ...(stockCode ? { stockCode } : {}),
      },
      update: {
        quantity: dto.quantity,
        ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
      },
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_ADJUSTED',
      entityType: 'BranchStock', entityId: stock.id,
      afterData: {
        branchId, productId: dto.productId,
        quantity: dto.quantity,
        ...(stockCode ? { stockCode } : {}),
      },
    });

    // Recalculate Product.stock = SUM of all BranchStock for this product
    await this.syncProductShadowStock(dto.productId);

    return stock;
  }

  // ── Stock Transfers ─────────────────────────────────────────────────────────

  async listTransfers(
    query: {
      branchId?: string;
      status?: string;
      productId?: string;
      startDate?: string;
      endDate?: string;
    },
    tenantId?: string | null,
  ) {
    const where: any = {};

    // Scope to tenant's branches
    if (tenantId) {
      const tenantBranchIds = await this.tenantSvc.getBranchIds(tenantId);
      if (query.branchId) {
        // Validate the requested branch belongs to this tenant
        if (!tenantBranchIds.includes(query.branchId)) {
          throw new ForbiddenException('สาขานี้ไม่ได้อยู่ในบัญชีของคุณ');
        }
        where.OR = [
          { fromBranchId: query.branchId },
          { toBranchId: query.branchId },
        ];
      } else {
        where.OR = [
          { fromBranchId: { in: tenantBranchIds } },
          { toBranchId: { in: tenantBranchIds } },
        ];
      }
    } else if (query.branchId) {
      where.OR = [
        { fromBranchId: query.branchId },
        { toBranchId: query.branchId },
      ];
    }

    if (query.status) where.status = query.status;
    if (query.productId) where.productId = query.productId;
    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = new Date(query.startDate);
      if (query.endDate) {
        const end = new Date(query.endDate);
        end.setDate(end.getDate() + 1);
        where.createdAt.lt = end;
      }
    }

    return this.prisma.stockTransfer.findMany({
      where,
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch:   { select: { id: true, name: true } },
        product:    { select: { id: true, name: true, sku: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async createTransfer(dto: CreateTransferDto, actorId?: string, actorName?: string, tenantId?: string) {
    if (dto.fromBranchId === dto.toBranchId) {
      throw new BadRequestException('สาขาต้นทางและปลายทางต้องไม่ใช่สาขาเดียวกัน');
    }

    const [fromBranch, toBranch, product] = await Promise.all([
      this.prisma.branch.findUnique({ where: { id: dto.fromBranchId } }),
      this.prisma.branch.findUnique({ where: { id: dto.toBranchId } }),
      this.prisma.product.findUnique({ where: { id: dto.productId } }),
    ]);
    if (!fromBranch) throw new NotFoundException('ไม่พบสาขาต้นทาง');
    if (!toBranch)   throw new NotFoundException('ไม่พบสาขาปลายทาง');
    if (!product)    throw new NotFoundException('ไม่พบสินค้า');

    // Validate all three resources belong to the calling tenant
    if (tenantId) {
      if (fromBranch.tenantId !== tenantId) throw new NotFoundException('ไม่พบสาขาต้นทาง');
      if (toBranch.tenantId   !== tenantId) throw new NotFoundException('ไม่พบสาขาปลายทาง');
      if (product.tenantId             !== tenantId) throw new NotFoundException('ไม่พบสินค้า');
    }

    if (fromBranch.status === 'SUSPENDED') throw new BadRequestException('สาขาต้นทางถูกระงับ');
    if (toBranch.status === 'SUSPENDED')   throw new BadRequestException('สาขาปลายทางถูกระงับ');

    const fromStock = await this.prisma.branchStock.findUnique({
      where: { branchId_productId: { branchId: dto.fromBranchId, productId: dto.productId } },
    });
    if (!fromStock || fromStock.quantity < dto.quantity) {
      throw new BadRequestException(
        `สต็อกสาขาต้นทางไม่เพียงพอ (มี ${fromStock?.quantity ?? 0} ชิ้น)`,
      );
    }

    const transfer = await this.prisma.stockTransfer.create({
      data: {
        transferNumber:  this.generateTransferNumber(),
        fromBranchId:    dto.fromBranchId,
        toBranchId:      dto.toBranchId,
        productId:       dto.productId,
        quantity:        dto.quantity,
        note:            dto.note,
        requestedById:   actorId,
        requestedByName: actorName,
        status:          'PENDING',
      },
      include: {
        fromBranch: { select: { name: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true, sku: true } },
      },
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER_REQUESTED',
      entityType: 'StockTransfer', entityId: transfer.id,
      afterData: {
        transferNumber: transfer.transferNumber,
        from: fromBranch.name, to: toBranch.name,
        product: product.name, quantity: dto.quantity, status: 'PENDING',
      },
    });

    try {
      await this.notif.notify({
        type: 'STOCK_TRANSFER_REQUESTED',
        title: 'มีคำขอโอนสินค้า',
        message: `${toBranch.name} ขอ ${product.name} จำนวน ${dto.quantity} ชิ้น`,
        severity: 'INFO',
        entityType: 'StockTransfer',
        entityId: transfer.id,
        branchId: dto.fromBranchId,
      });
    } catch { /* non-blocking */ }

    return transfer;
  }

  async completeTransfer(id: string, actorId?: string, actorName?: string, tenantId?: string | null) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { name: true, tenantId: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอน');
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException('รายการนี้ไม่ได้อยู่ในสถานะ PENDING');
    }

    // Tenant isolation
    if (tenantId && (transfer.fromBranch as any).tenantId !== tenantId) {
      throw new NotFoundException('ไม่พบรายการโอน');
    }

    const fromStock = await this.prisma.branchStock.findUnique({
      where: { branchId_productId: { branchId: transfer.fromBranchId, productId: transfer.productId } },
    });
    if (!fromStock || fromStock.quantity < transfer.quantity) {
      throw new BadRequestException(
        `สต็อกสาขาต้นทางไม่เพียงพอ (มี ${fromStock?.quantity ?? 0} ชิ้น)`,
      );
    }

    const toStockExisting = await this.prisma.branchStock.findUnique({
      where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
    });

    await this.prisma.$transaction(async (tx) => {
      const deducted = await tx.branchStock.updateMany({
        where: {
          branchId:  transfer.fromBranchId,
          productId: transfer.productId,
          quantity:  { gte: transfer.quantity },
        },
        data: { quantity: { decrement: transfer.quantity } },
      });
      if (deducted.count === 0) {
        throw new BadRequestException(
          `สต็อกสาขาต้นทางไม่เพียงพอ ไม่สามารถโอนได้ (อาจมีการโอนพร้อมกัน)`,
        );
      }

      const toStockCode = !toStockExisting
        ? await this.generateStockCode(transfer.toBranchId, tx)
        : null;

      await tx.branchStock.upsert({
        where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
        create: {
          branchId:  transfer.toBranchId,
          productId: transfer.productId,
          quantity:  transfer.quantity,
          minStock:  0,
          ...(toStockCode ? { stockCode: toStockCode } : {}),
        },
        update: { quantity: { increment: transfer.quantity } },
      });

      await tx.stockMovement.createMany({
        data: [
          {
            type: 'TRANSFER_OUT',
            quantity:      transfer.quantity,
            productId:     transfer.productId,
            branchId:      transfer.fromBranchId,
            referenceType: 'StockTransfer',
            referenceId:   id,
            note: `โอนออก → ${transfer.toBranch.name} (${transfer.transferNumber}) [สำเร็จทันที]`,
          },
          {
            type: 'TRANSFER_IN',
            quantity:      transfer.quantity,
            productId:     transfer.productId,
            branchId:      transfer.toBranchId,
            referenceType: 'StockTransfer',
            referenceId:   id,
            note: `โอนเข้า ← ${transfer.fromBranch.name} (${transfer.transferNumber}) [สำเร็จทันที]`,
          },
        ],
      });

      await this.syncProductShadowStock(transfer.productId, tx);

      await tx.stockTransfer.update({
        where: { id },
        data: {
          status:          'COMPLETED',
          completedAt:     new Date(),
          completedById:   actorId,
          completedByName: actorName,
        },
      });
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER',
      entityType: 'StockTransfer', entityId: id,
      afterData: { status: 'COMPLETED', quantity: transfer.quantity },
    });

    return this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch:   { select: { id: true, name: true } },
        product:    { select: { id: true, name: true, sku: true } },
      },
    });
  }

  async approveTransfer(id: string, actorId?: string, actorName?: string, actorBranchId?: string | null, actorRole?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { name: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอน');
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException(`ไม่สามารถอนุมัติได้ (สถานะปัจจุบัน: ${transfer.status})`);
    }
    const isPrivileged = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    if (!isPrivileged && actorBranchId && actorBranchId !== transfer.fromBranchId) {
      throw new ForbiddenException('เฉพาะสาขาต้นทางเท่านั้นที่อนุมัติได้');
    }

    const updated = await this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status:          'APPROVED',
        approvedById:    actorId,
        approvedByName:  actorName,
        approvedAt:      new Date(),
      },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch:   { select: { id: true, name: true } },
        product:    { select: { id: true, name: true, sku: true } },
      },
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER_APPROVED',
      entityType: 'StockTransfer', entityId: id,
      beforeData: { status: 'PENDING' },
      afterData: {
        status: 'APPROVED',
        product: transfer.product.name,
        quantity: transfer.quantity,
        fromBranch: transfer.fromBranch.name,
        toBranch:   transfer.toBranch.name,
      },
    });

    try {
      await this.notif.notify({
        type: 'STOCK_TRANSFER_APPROVED',
        title: 'คำขอโอนสินค้าได้รับการอนุมัติ',
        message: `${transfer.product.name} จำนวน ${transfer.quantity} ชิ้น อนุมัติแล้ว รอสาขาต้นทางส่งของ`,
        severity: 'INFO',
        entityType: 'StockTransfer',
        entityId: id,
        branchId: transfer.toBranchId,
      });
    } catch { /* non-blocking */ }

    return updated;
  }

  async rejectTransfer(id: string, rejectReason?: string, actorId?: string, actorName?: string, actorBranchId?: string | null, actorRole?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { name: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอน');
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException(`ไม่สามารถปฏิเสธได้ (สถานะปัจจุบัน: ${transfer.status})`);
    }
    const isPrivileged = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    if (!isPrivileged && actorBranchId && actorBranchId !== transfer.fromBranchId) {
      throw new ForbiddenException('เฉพาะสาขาต้นทางเท่านั้นที่ปฏิเสธได้');
    }

    const updated = await this.prisma.stockTransfer.update({
      where: { id },
      data: {
        status:          'REJECTED',
        rejectedById:    actorId,
        rejectedByName:  actorName,
        rejectedAt:      new Date(),
        rejectReason:    rejectReason ?? null,
      },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch:   { select: { id: true, name: true } },
        product:    { select: { id: true, name: true, sku: true } },
      },
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER_REJECTED',
      entityType: 'StockTransfer', entityId: id,
      beforeData: { status: 'PENDING' },
      afterData: {
        status: 'REJECTED', rejectReason,
        product: transfer.product.name,
        fromBranch: transfer.fromBranch.name,
        toBranch:   transfer.toBranch.name,
      },
    });

    try {
      await this.notif.notify({
        type: 'STOCK_TRANSFER_REJECTED',
        title: 'คำขอโอนสินค้าถูกปฏิเสธ',
        message: `${transfer.product.name} จำนวน ${transfer.quantity} ชิ้น${rejectReason ? ` — ${rejectReason}` : ''}`,
        severity: 'WARNING',
        entityType: 'StockTransfer',
        entityId: id,
        branchId: transfer.toBranchId,
      });
    } catch { /* non-blocking */ }

    return updated;
  }

  async dispatchTransfer(id: string, actorId?: string, actorName?: string, actorBranchId?: string | null, actorRole?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { name: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอน');
    if (transfer.status !== 'APPROVED') {
      throw new BadRequestException(`ไม่สามารถส่งของได้ (สถานะปัจจุบัน: ${transfer.status})`);
    }
    const isPrivileged = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    if (!isPrivileged && actorBranchId && actorBranchId !== transfer.fromBranchId) {
      throw new ForbiddenException('เฉพาะสาขาต้นทางเท่านั้นที่จัดส่งได้');
    }

    // Pre-check (informational — atomic guard is inside transaction)
    const fromStockBefore = await this.prisma.branchStock.findUnique({
      where: { branchId_productId: { branchId: transfer.fromBranchId, productId: transfer.productId } },
    });
    if (!fromStockBefore || fromStockBefore.quantity < transfer.quantity) {
      throw new BadRequestException(
        `สต็อกสาขาต้นทางไม่เพียงพอ (มี ${fromStockBefore?.quantity ?? 0} ชิ้น ต้องการ ${transfer.quantity} ชิ้น)`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Atomic debit — prevents negative stock under concurrent sales/transfers
      const deducted = await tx.branchStock.updateMany({
        where: {
          branchId:  transfer.fromBranchId,
          productId: transfer.productId,
          quantity:  { gte: transfer.quantity },
        },
        data: { quantity: { decrement: transfer.quantity } },
      });
      if (deducted.count === 0) {
        throw new BadRequestException(
          `สต็อกสาขาต้นทางไม่เพียงพอในขณะส่งของ (อาจมีการขายหรือโอนพร้อมกัน)`,
        );
      }

      // Record TRANSFER_OUT movement
      await tx.stockMovement.create({
        data: {
          type:          'TRANSFER_OUT',
          quantity:      transfer.quantity,
          productId:     transfer.productId,
          branchId:      transfer.fromBranchId,
          referenceType: 'StockTransfer',
          referenceId:   id,
          note: `โอนออก → ${transfer.toBranch.name} (${transfer.transferNumber})`,
        },
      });

      await this.syncProductShadowStock(transfer.productId, tx);

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status:          'IN_TRANSIT',
          inTransitById:   actorId,
          inTransitByName: actorName,
          inTransitAt:     new Date(),
        },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch:   { select: { id: true, name: true } },
          product:    { select: { id: true, name: true, sku: true } },
        },
      });
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER_DISPATCHED',
      entityType: 'StockTransfer', entityId: id,
      beforeData: { status: 'APPROVED' },
      afterData: {
        status: 'IN_TRANSIT',
        product: transfer.product.name,
        quantity: transfer.quantity,
        fromBranch: transfer.fromBranch.name,
        toBranch:   transfer.toBranch.name,
      },
    });

    try {
      await this.notif.notify({
        type: 'STOCK_TRANSFER_IN_TRANSIT',
        title: 'กำลังส่งสินค้า',
        message: `${transfer.product.name} จำนวน ${transfer.quantity} ชิ้น กำลังส่งไปที่ ${transfer.toBranch.name}`,
        severity: 'INFO',
        entityType: 'StockTransfer',
        entityId: id,
        branchId: transfer.toBranchId,
      });
    } catch { /* non-blocking */ }

    return updated;
  }

  async receiveTransfer(id: string, actorId?: string, actorName?: string, actorBranchId?: string | null, actorRole?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { name: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอน');
    if (transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException(`ไม่สามารถยืนยันรับของได้ (สถานะปัจจุบัน: ${transfer.status})`);
    }
    const isPrivileged = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';
    if (!isPrivileged && actorBranchId && actorBranchId !== transfer.toBranchId) {
      throw new ForbiddenException('เฉพาะสาขาปลายทางเท่านั้นที่รับสินค้าได้');
    }

    // Stock was already deducted from source at dispatch — only need to credit destination
    const toStockExisting = await this.prisma.branchStock.findUnique({
      where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
    });

    const updated = await this.prisma.$transaction(async (tx) => {
      const toStockCode = !toStockExisting
        ? await this.generateStockCode(transfer.toBranchId, tx)
        : null;

      await tx.branchStock.upsert({
        where: { branchId_productId: { branchId: transfer.toBranchId, productId: transfer.productId } },
        create: {
          branchId:  transfer.toBranchId,
          productId: transfer.productId,
          quantity:  transfer.quantity,
          minStock:  0,
          ...(toStockCode ? { stockCode: toStockCode } : {}),
        },
        update: { quantity: { increment: transfer.quantity } },
      });

      // TRANSFER_IN only — TRANSFER_OUT was already recorded at dispatch
      await tx.stockMovement.create({
        data: {
          type:          'TRANSFER_IN',
          quantity:      transfer.quantity,
          productId:     transfer.productId,
          branchId:      transfer.toBranchId,
          referenceType: 'StockTransfer',
          referenceId:   id,
          note: `โอนเข้า ← ${transfer.fromBranch.name} (${transfer.transferNumber})`,
        },
      });

      await this.syncProductShadowStock(transfer.productId, tx);

      return tx.stockTransfer.update({
        where: { id },
        data: {
          status:          'RECEIVED',
          receivedById:    actorId,
          receivedByName:  actorName,
          receivedAt:      new Date(),
        },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch:   { select: { id: true, name: true } },
          product:    { select: { id: true, name: true, sku: true } },
        },
      });
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER_RECEIVED',
      entityType: 'StockTransfer', entityId: id,
      beforeData: { status: 'IN_TRANSIT' },
      afterData: {
        status: 'RECEIVED',
        product: transfer.product.name,
        quantity: transfer.quantity,
        fromBranch: transfer.fromBranch.name,
        toBranch:   transfer.toBranch.name,
      },
    });

    try {
      await this.notif.notify({
        type: 'STOCK_TRANSFER_RECEIVED',
        title: 'รับสินค้าโอนแล้ว',
        message: `${transfer.product.name} จำนวน ${transfer.quantity} ชิ้น รับที่ ${transfer.toBranch.name} แล้ว`,
        severity: 'INFO',
        entityType: 'StockTransfer',
        entityId: id,
        branchId: transfer.fromBranchId,
      });
    } catch { /* non-blocking */ }

    try { await this.checkBranchLowStock(); } catch { /* non-blocking */ }

    return updated;
  }

  async cancelTransfer(id: string, reason: string, actorId?: string, actorName?: string, actorBranchId?: string | null, actorRole?: string) {
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id },
      include: {
        fromBranch: { select: { name: true } },
        toBranch:   { select: { name: true } },
        product:    { select: { name: true } },
      },
    });
    if (!transfer) throw new NotFoundException('ไม่พบรายการโอน');

    const cancellable: string[] = ['PENDING', 'APPROVED', 'IN_TRANSIT'];
    if (!cancellable.includes(transfer.status)) {
      throw new BadRequestException(`ไม่สามารถยกเลิกได้ (สถานะปัจจุบัน: ${transfer.status})`);
    }

    const isPrivileged = actorRole === 'OWNER' || actorRole === 'SUPER_ADMIN';

    // IN_TRANSIT: stock already deducted at dispatch — only OWNER can cancel and must refund
    if (transfer.status === 'IN_TRANSIT') {
      if (!isPrivileged) {
        throw new ForbiddenException(
          'เฉพาะ Owner เท่านั้นที่ยกเลิกการโอนระหว่างจัดส่งได้ (สต็อกต้นทางถูกหักไปแล้วตอนจัดส่ง)',
        );
      }

      await this.prisma.$transaction(async (tx) => {
        // Return stock to source
        await tx.branchStock.upsert({
          where: { branchId_productId: { branchId: transfer.fromBranchId, productId: transfer.productId } },
          create: {
            branchId:  transfer.fromBranchId,
            productId: transfer.productId,
            quantity:  transfer.quantity,
            minStock:  0,
          },
          update: { quantity: { increment: transfer.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type:          'TRANSFER_IN',
            quantity:      transfer.quantity,
            productId:     transfer.productId,
            branchId:      transfer.fromBranchId,
            referenceType: 'StockTransfer',
            referenceId:   id,
            note: `ยกเลิกระหว่างจัดส่ง — คืนสต็อกต้นทาง (${transfer.transferNumber})`,
          },
        });

        await this.syncProductShadowStock(transfer.productId, tx);

        await tx.stockTransfer.update({
          where: { id },
          data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
        });
      });

      this.auditLog.log({
        actorId, actorName, action: 'STOCK_TRANSFER_CANCELLED',
        entityType: 'StockTransfer', entityId: id,
        beforeData: { status: 'IN_TRANSIT' },
        afterData: {
          status: 'CANCELLED', cancelReason: reason,
          stockRefunded: transfer.quantity,
          refundedTo: transfer.fromBranch.name,
        },
      });

      return this.prisma.stockTransfer.findUnique({
        where: { id },
        include: {
          fromBranch: { select: { id: true, name: true } },
          toBranch:   { select: { id: true, name: true } },
          product:    { select: { id: true, name: true, sku: true } },
        },
      });
    }

    // PENDING or APPROVED — no stock to refund
    if (!isPrivileged && actorBranchId && actorBranchId !== transfer.toBranchId) {
      throw new ForbiddenException('เฉพาะสาขาที่ขอโอนเท่านั้นที่ยกเลิกได้');
    }

    const updated = await this.prisma.stockTransfer.update({
      where: { id },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelReason: reason },
      include: {
        fromBranch: { select: { id: true, name: true } },
        toBranch:   { select: { id: true, name: true } },
        product:    { select: { id: true, name: true, sku: true } },
      },
    });

    this.auditLog.log({
      actorId, actorName, action: 'STOCK_TRANSFER_CANCELLED',
      entityType: 'StockTransfer', entityId: id,
      beforeData: { status: transfer.status },
      afterData: { status: 'CANCELLED', cancelReason: reason },
    });

    return updated;
  }

  // ── Branch-level low stock check (called from notifications scheduler) ──────

  async checkBranchLowStock() {
    const lowStocks: any[] = await this.prisma.$queryRaw`
      SELECT bs.id, bs."branchId", bs."productId", bs.quantity, bs."minStock",
             p.name AS "productName", b.name AS "branchName"
      FROM "BranchStock" bs
      JOIN "Product" p ON p.id = bs."productId"
      JOIN "Branch"  b ON b.id = bs."branchId"
      WHERE bs.quantity <= bs."minStock" AND bs."minStock" > 0 AND b."isActive" = true
    `;

    for (const row of lowStocks) {
      try {
        await this.notif.notify({
          type: 'BRANCH_LOW_STOCK',
          title: 'สต็อกสาขาต่ำ',
          message: `${row.productName} ที่สาขา ${row.branchName} เหลือ ${row.quantity} ชิ้น`,
          severity: 'WARNING',
          entityType: 'BranchStock',
          entityId: row.id,
          branchId: row.branchId,
        });
      } catch { /* non-blocking */ }
    }
  }
}
