import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { CreatePurchaseOrderDto } from './dto/create-po.dto';
import { UpdatePurchaseOrderDto } from './dto/update-po.dto';
import { ReceiveGoodsDto } from './dto/receive-goods.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';

const PO_INCLUDE = {
  supplier: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true, stock: true } },
    },
  },
  payments: { orderBy: { paidAt: 'desc' as const } },
} as const;

const CANCELLABLE_STATUSES = ['DRAFT', 'ORDERED'];

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
  ) {}

  private async generatePoNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `PO-${dateStr}-`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
    });
    const lastNum = last
      ? parseInt(last.poNumber.replace(prefix, ''), 10)
      : 0;
    return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
  }

  async create(dto: CreatePurchaseOrderDto, userId: string, tenantId?: string | null) {
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('ต้องมีสินค้าอย่างน้อย 1 รายการ');
    }

    const poNumber = await this.generatePoNumber();

    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
      select: { creditDays: true, tenantId: true },
    });
    if (!supplier) throw new NotFoundException('ไม่พบ Supplier');
    if (tenantId && supplier.tenantId !== tenantId) {
      throw new NotFoundException('ไม่พบ Supplier');
    }
    const orderDate = new Date();
    const dueDate =
      supplier && supplier.creditDays > 0
        ? new Date(orderDate.getTime() + supplier.creditDays * 24 * 60 * 60 * 1000)
        : undefined;

    const itemSubtotals = dto.items.map(
      (i) => i.unitCost * i.quantity - (i.discount || 0),
    );
    const subtotal = itemSubtotals.reduce((s, v) => s + v, 0);
    const discount = dto.discount || 0;
    const vatPercent = dto.vatPercent || 0;
    const vatBase = subtotal - discount;
    const vatAmount = (vatBase * vatPercent) / 100;
    const total = vatBase + vatAmount;

    const po = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        supplierId: dto.supplierId,
        createdById: userId,
        status: (dto.status as any) || 'DRAFT',
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        dueDate,
        subtotal,
        discount,
        vatPercent,
        vatAmount,
        total,
        note: dto.note,
        items: {
          create: dto.items.map((item, idx) => ({
            productId: item.productId,
            quantity: item.quantity,
            unitCost: item.unitCost,
            discount: item.discount || 0,
            total: itemSubtotals[idx],
          })),
        },
      },
      include: PO_INCLUDE,
    });
    await this.auditLog.log({
      actorId: userId,
      action: 'PO_CREATED',
      entityType: 'PurchaseOrder',
      entityId: po.id,
      afterData: { poNumber, supplierId: dto.supplierId, total: Number(total), itemCount: dto.items.length },
    });
    return po;
  }

  findAll(query: { status?: string; supplierId?: string; search?: string }, tenantId?: string | null) {
    const where: any = {};
    if (query.status)     where.status      = query.status;
    if (query.supplierId) where.supplierId  = query.supplierId;
    if (query.search)     where.poNumber    = { contains: query.search, mode: 'insensitive' };
    if (tenantId)         where.supplier    = { tenantId };

    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        supplier: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, tenantId?: string | null) {
    const where: any = { id };
    if (tenantId) where.supplier = { tenantId };
    const po = await this.prisma.purchaseOrder.findFirst({
      where,
      include: PO_INCLUDE,
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async update(id: string, dto: UpdatePurchaseOrderDto, actorId?: string, tenantId?: string | null) {
    const po = await this.findOne(id, tenantId);

    if (po.status === 'CANCELLED') {
      throw new BadRequestException('ไม่สามารถแก้ไข PO ที่ยกเลิกแล้ว');
    }
    if (po.status === 'RECEIVED') {
      throw new BadRequestException('ไม่สามารถแก้ไข PO ที่รับสินค้าครบแล้ว');
    }

    if (dto.status === 'CANCELLED' && !CANCELLABLE_STATUSES.includes(po.status)) {
      throw new BadRequestException('สามารถยกเลิกได้เฉพาะ PO ที่อยู่ในสถานะ DRAFT หรือ ORDERED');
    }

    const updated = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        note: dto.note !== undefined ? dto.note : undefined,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : undefined,
        status: dto.status as any,
      },
      include: PO_INCLUDE,
    });
    await this.auditLog.log({
      actorId,
      action: dto.status === 'CANCELLED' ? 'PO_CANCELLED' : 'PO_UPDATED',
      entityType: 'PurchaseOrder',
      entityId: id,
      afterData: { status: dto.status, note: dto.note },
    });
    return updated;
  }

  async receiveGoods(poId: string, dto: ReceiveGoodsDto, actorId?: string, tenantId?: string | null) {
    const po = await this.findOne(poId, tenantId);

    if (!['ORDERED', 'PARTIAL_RECEIVED'].includes(po.status)) {
      throw new BadRequestException(
        'สามารถรับสินค้าได้เฉพาะ PO ที่สถานะ ORDERED หรือ PARTIAL_RECEIVED',
      );
    }

    const itemsToReceive = dto.items.filter((i) => i.quantity > 0);
    if (itemsToReceive.length === 0) {
      throw new BadRequestException('ต้องระบุจำนวนที่รับอย่างน้อย 1 รายการ');
    }

    for (const recv of itemsToReceive) {
      const poItem = po.items.find((i) => i.id === recv.purchaseOrderItemId);
      if (!poItem) {
        throw new BadRequestException(
          `ไม่พบรายการสินค้า ID: ${recv.purchaseOrderItemId} ใน PO นี้`,
        );
      }
      const remaining = poItem.quantity - poItem.receivedQty;
      if (recv.quantity > remaining) {
        throw new BadRequestException(
          `สินค้า "${poItem.product.name}" รับได้อีกสูงสุด ${remaining} ชิ้น`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const recv of itemsToReceive) {
        const poItem = po.items.find((i) => i.id === recv.purchaseOrderItemId)!;

        // Re-read receivedQty inside the transaction so concurrent receives cannot
        // both see stale data and double-count the same items.
        const freshItem = await tx.purchaseOrderItem.findUnique({
          where: { id: recv.purchaseOrderItemId },
          select: { quantity: true, receivedQty: true },
        });
        if (!freshItem) {
          throw new BadRequestException(`ไม่พบรายการสินค้า ID: ${recv.purchaseOrderItemId}`);
        }
        const remainingQty = freshItem.quantity - freshItem.receivedQty;
        if (recv.quantity > remainingQty) {
          throw new BadRequestException(
            `สินค้า "${poItem.product.name}" รับได้อีกสูงสุด ${remainingQty} ชิ้น (อาจมีการรับพร้อมกัน)`,
          );
        }

        await tx.purchaseOrderItem.update({
          where: { id: recv.purchaseOrderItemId },
          data: { receivedQty: { increment: recv.quantity } },
        });

        await tx.product.update({
          where: { id: poItem.productId },
          data: { stock: { increment: recv.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            type: 'IN',
            quantity: recv.quantity,
            productId: poItem.productId,
            note: dto.note ?? `รับสินค้าจาก PO: ${po.poNumber}`,
            referenceType: 'PURCHASE_ORDER',
            referenceId: poId,
          },
        });
      }

      const updatedItems = await tx.purchaseOrderItem.findMany({
        where: { purchaseOrderId: poId },
      });

      const allReceived = updatedItems.every(
        (i) => i.receivedQty >= i.quantity,
      );

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: allReceived ? 'RECEIVED' : 'PARTIAL_RECEIVED' },
      });
    });

    const result = await this.findOne(poId);
    await this.auditLog.log({
      actorId,
      action: 'PO_GOODS_RECEIVED',
      entityType: 'PurchaseOrder',
      entityId: poId,
      afterData: { itemsReceived: dto.items.filter((i) => i.quantity > 0).length, note: dto.note },
    });
    return result;
  }

  async getMovements(poId: string, tenantId?: string | null) {
    await this.findOne(poId, tenantId);
    return this.prisma.stockMovement.findMany({
      where: { referenceType: 'PURCHASE_ORDER', referenceId: poId },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPayment(poId: string, dto: CreatePaymentDto, userId: string, tenantId?: string | null) {
    // CASH payments must be made during an active shift
    if (dto.paymentMethod === 'CASH') {
      const activeShift = await this.prisma.shift.findFirst({
        where: { userId, isActive: true },
        select: { id: true },
      });
      if (!activeShift) {
        throw new BadRequestException('กรุณาเปิดกะก่อนจ่ายเงินสดให้ซัพพลายเออร์');
      }
    }

    const po = await this.findOne(poId, tenantId);

    if (po.status === 'CANCELLED') {
      throw new BadRequestException('ไม่สามารถบันทึกการจ่ายเงินสำหรับ PO ที่ยกเลิกแล้ว');
    }
    if (po.status === 'DRAFT') {
      throw new BadRequestException('ไม่สามารถบันทึกการจ่ายเงินสำหรับ PO ที่ยังเป็น Draft');
    }
    if (po.paymentStatus === 'PAID') {
      throw new BadRequestException('PO นี้จ่ายเงินครบแล้ว');
    }

    const remaining = Number(po.total) - Number(po.paidTotal);
    if (dto.amount > remaining + 0.001) {
      throw new BadRequestException(
        `จำนวนเงินที่จ่าย (${dto.amount}) เกินยอดคงเหลือ (${remaining.toFixed(2)} บาท)`,
      );
    }

    const newPaidTotal = Number(po.paidTotal) + dto.amount;
    const newPaymentStatus =
      newPaidTotal >= Number(po.total) - 0.001 ? 'PAID' : 'PARTIAL_PAID';

    await this.prisma.$transaction([
      this.prisma.supplierPayment.create({
        data: {
          purchaseOrderId: poId,
          amount: dto.amount,
          paymentMethod: dto.paymentMethod as any,
          note: dto.note,
        },
      }),
      this.prisma.purchaseOrder.update({
        where: { id: poId },
        data: {
          paidTotal: newPaidTotal,
          paymentStatus: newPaymentStatus as any,
        },
      }),
    ]);

    const result = await this.findOne(poId);
    await this.auditLog.log({
      actorId: userId,
      action: 'PO_PAYMENT',
      entityType: 'PurchaseOrder',
      entityId: poId,
      afterData: { amount: dto.amount, paymentMethod: dto.paymentMethod },
    });
    return result;
  }

  async getPayments(poId: string, tenantId?: string | null) {
    await this.findOne(poId, tenantId);
    return this.prisma.supplierPayment.findMany({
      where: { purchaseOrderId: poId },
      orderBy: { paidAt: 'desc' },
    });
  }
}
