import { randomBytes } from 'crypto';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService, LARGE_REFUND_THRESHOLD } from '../notifications/notifications.service';
import { CreateSaleDto } from './dto/create-sale.dto';
import { RefundSaleDto } from './dto/refund-sale.dto';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
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

  private generateReceiptNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `RCP-${dateStr}-${suffix}`;
  }

  private async resolveCustomerId(dto: CreateSaleDto): Promise<string | undefined> {
    if (dto.customerId) return dto.customerId;
    if (!dto.customerName) return undefined;

    if (dto.customerPhone) {
      const existing = await this.prisma.customer.findFirst({
        where: { phone: dto.customerPhone },
      });
      if (existing) return existing.id;
    }

    const created = await this.prisma.customer.create({
      data: { name: dto.customerName, phone: dto.customerPhone, tags: [] },
    });
    return created.id;
  }

  async create(dto: CreateSaleDto, userId: string, branchId?: string) {
    if (branchId) await this.assertBranchActive(branchId);

    const activeShift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    if (!activeShift) {
      throw new BadRequestException('กรุณาเปิดกะก่อนทำรายการขาย');
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true },
    });

    if (products.length !== new Set(productIds).size) {
      throw new NotFoundException('One or more products not found');
    }

    // B-2 FIX: Aggregate quantities per productId before stock check so that
    // duplicate line items (same product appearing twice) cannot individually
    // pass the check while their combined demand exceeds available stock.
    const demandMap = new Map<string, number>();
    for (const item of dto.items) {
      demandMap.set(item.productId, (demandMap.get(item.productId) ?? 0) + item.quantity);
    }

    // Pre-fetch BranchStock for all items when we have a branch context
    const branchStockMap = new Map<string, number>();
    if (branchId) {
      const bsRows = await this.prisma.branchStock.findMany({
        where: { branchId, productId: { in: productIds } },
        select: { productId: true, quantity: true },
      });
      for (const r of bsRows) branchStockMap.set(r.productId, r.quantity);
    }

    // N-1 NOTE: these pre-transaction checks are optimistic fast-fails using a
    // snapshot taken before the tx. The authoritative race-safe guard is the
    // in-transaction atomic updateMany (C-1 fix) that prevents oversell even
    // when two concurrent requests both pass this pre-check.
    for (const [pid, totalQty] of demandMap) {
      const product = products.find((p) => p.id === pid);
      if (branchId) {
        const available = branchStockMap.get(pid) ?? 0;
        if (available < totalQty) {
          throw new BadRequestException(
            `สต็อกสาขาไม่พอสำหรับ "${product.name}" คงเหลือ: ${available} ชิ้น (ต้องการ: ${totalQty})`,
          );
        }
      } else if (product.stock < totalQty) {
        throw new BadRequestException(
          `Insufficient stock for "${product.name}". Available: ${product.stock} (needed: ${totalQty})`,
        );
      }
    }

    for (const item of dto.items) {
      const product = products.find((p) => p.id === item.productId);
      if (product.hasSerial) {
        if (!item.serialIds || item.serialIds.length === 0) {
          throw new BadRequestException(
            `"${product.name}" requires serial number(s) — ${item.quantity} needed`,
          );
        }
        if (item.serialIds.length !== item.quantity) {
          throw new BadRequestException(
            `"${product.name}" needs ${item.quantity} serial(s) but got ${item.serialIds.length}`,
          );
        }
      }
    }

    const subtotal = dto.items.reduce((sum, item) => {
      return sum + item.price * item.quantity - (item.discount || 0);
    }, 0);

    const discount = dto.discount || 0;
    if (discount > subtotal) {
      throw new BadRequestException('Discount cannot exceed the order subtotal');
    }
    const total = subtotal - discount;
    const change = dto.amountPaid - total;

    if (change < 0) {
      throw new BadRequestException('Amount paid is less than total');
    }

    const customerId = await this.resolveCustomerId(dto);

    const sale = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          receiptNumber: this.generateReceiptNumber(),
          userId,
          customerId,
          shiftId: activeShift.id,
          branchId: branchId ?? null,
          paymentMethod: dto.paymentMethod as any,
          subtotal,
          discount,
          total,
          amountPaid: dto.amountPaid,
          change,
          note: dto.note,
          status: 'COMPLETED',
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              price: item.price,
              costPrice: Number(products.find((p) => p.id === item.productId)?.costPrice ?? 0),
              discount: item.discount || 0,
              total: item.price * item.quantity - (item.discount || 0),
            })),
          },
        },
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
        },
      });

      for (const item of dto.items) {
        const product = products.find((p) => p.id === item.productId);

        if (branchId) {
          // C-1 FIX: atomic conditional decrement prevents concurrent oversell.
          // updateMany with `quantity >= demand` only writes if stock is still
          // sufficient at write time. count=0 means a concurrent sale beat us —
          // the transaction rolls back automatically on throw.
          const bsResult = await (tx as any).branchStock.updateMany({
            where: {
              branchId,
              productId: item.productId,
              quantity: { gte: item.quantity },
            },
            data: { quantity: { decrement: item.quantity } },
          });
          if (bsResult.count === 0) {
            const bs = await (tx as any).branchStock.findUnique({
              where: { branchId_productId: { branchId, productId: item.productId } },
              select: { quantity: true },
            });
            throw new BadRequestException(
              `สต็อกสาขาไม่พอสำหรับ "${product.name}" คงเหลือ: ${bs?.quantity ?? 0} ชิ้น (ต้องการ: ${item.quantity})`,
            );
          }
          // Shadow: keep Product.stock in sync for backward-compat display only.
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { decrement: item.quantity } },
          });
        } else {
          // C-1 FIX: atomic conditional decrement for the global (no-branch) stock path.
          const prodResult = await tx.product.updateMany({
            where: { id: item.productId, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          });
          if (prodResult.count === 0) {
            throw new BadRequestException(
              `Insufficient stock for "${product.name}". Stock was updated by a concurrent sale.`,
            );
          }
        }

        const saleItem = sale.items.find((si) => si.productId === item.productId);
        await tx.stockMovement.create({
          data: {
            productId:  item.productId,
            type:       'SALE',
            quantity:   item.quantity,
            saleItemId: saleItem?.id,
            branchId:   branchId ?? null,
            note:       `Sale ${sale.receiptNumber}`,
          },
        });

        if (product.hasSerial && item.serialIds?.length) {
          const serials = await tx.serialNumber.findMany({
            where: { id: { in: item.serialIds } },
          });

          for (const s of serials) {
            if (s.status !== 'IN_STOCK') {
              throw new BadRequestException(`Serial "${s.serial}" is not available (${s.status})`);
            }
            if (s.productId !== item.productId) {
              throw new BadRequestException(`Serial "${s.serial}" does not belong to this product`);
            }
          }

          const soldAt = new Date();
          const warrantyExpiresAt = product.warrantyDays
            ? new Date(soldAt.getTime() + product.warrantyDays * 24 * 60 * 60 * 1000)
            : null;

          await tx.serialNumber.updateMany({
            where: { id: { in: item.serialIds } },
            data: {
              status: 'SOLD',
              saleItemId: saleItem.id,
              soldAt,
              warrantyExpiresAt,
            },
          });
        }
      }

      await this.auditLog.log({
        actorId: userId,
        action: 'SALE_CREATED',
        entityType: 'Sale',
        entityId: sale.id,
        afterData: {
          receiptNumber: sale.receiptNumber,
          total: Number(sale.total),
          paymentMethod: sale.paymentMethod,
          itemCount: sale.items.length,
        },
      });

      return sale;
    });

    // Post-transaction: check low stock for each sold product
    for (const item of dto.items) {
      const p = await this.prisma.product.findUnique({
        where: { id: item.productId },
        select: { id: true, name: true, stock: true, minStock: true },
      });
      if (p) await this.notif.notifyLowStock(p.id, p.name, p.stock, p.minStock);
    }

    return sale;
  }

  async findAll(query: {
    date?: string;
    customerId?: string;
    shiftId?: string;
    branchId?: string;
    limit?: number;
    cursor?: string;
  }, tenantId?: string | null) {
    const where: any = {};

    if (query.date) {
      const start = new Date(`${query.date}T00:00:00+07:00`);
      const end   = new Date(`${query.date}T00:00:00+07:00`);
      end.setDate(end.getDate() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    if (query.customerId) where.customerId = query.customerId;
    if (query.shiftId)    where.shiftId    = query.shiftId;
    if (query.branchId)   where.branchId   = query.branchId;
    if (tenantId)         where.branch     = { tenantId };

    const take = Math.min(query.limit ?? 50, 200);

    const findManyArgs: Parameters<typeof this.prisma.sale.findMany>[0] = {
      where,
      include: {
        items: { include: { product: { select: { name: true, sku: true } } } },
        customer: { select: { id: true, name: true, phone: true } },
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: take + 1,
    };

    if (query.cursor) {
      findManyArgs.cursor = { id: query.cursor };
      findManyArgs.skip   = 1;
    }

    const [rows, total] = await Promise.all([
      this.prisma.sale.findMany(findManyArgs),
      this.prisma.sale.count({ where }),
    ]);

    const hasNext  = rows.length > take;
    const items    = hasNext ? rows.slice(0, take) : rows;
    const nextCursor = hasNext ? items[items.length - 1].id : null;

    return { items, nextCursor, total };
  }

  async findOne(id: string, tenantId?: string | null) {
    const where: any = { id };
    if (tenantId) where.branch = { tenantId };
    const sale = await this.prisma.sale.findFirst({
      where,
      include: {
        items: { include: { product: true } },
        customer: true,
        user: { select: { id: true, name: true } },
        shift: true,
        refunds: {
          include: {
            items: { include: { product: { select: { id: true, name: true } } } },
            createdBy: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
  }

  private generateRefundNumber(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `REF-${dateStr}-${suffix}`;
  }

  async refundSaleItems(id: string, dto: RefundSaleDto, userId: string, tenantId?: string | null) {
    const refundWhere: any = { id };
    if (tenantId) refundWhere.branch = { tenantId };
    const sale = await this.prisma.sale.findFirst({
      where: refundWhere,
      include: {
        items: {
          include: {
            product: { select: { id: true, name: true, hasSerial: true } },
            serialNumbers: { select: { id: true } },
          },
        },
        customer: { select: { id: true } },
        branch:   { select: { id: true } },
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status === 'VOIDED') throw new BadRequestException('ไม่สามารถคืนเงินบิลที่ยกเลิกแล้ว');
    if (sale.status === 'REFUNDED') throw new BadRequestException('บิลนี้ถูกคืนเงินครบแล้ว');

    for (const refundItem of dto.items) {
      const saleItem = sale.items.find((si) => si.id === refundItem.saleItemId);
      if (!saleItem) throw new NotFoundException(`SaleItem ${refundItem.saleItemId} not found in this sale`);

      const remainingQty = saleItem.quantity - saleItem.refundedQty;
      if (refundItem.quantity > remainingQty) {
        throw new BadRequestException(
          `สินค้า "${saleItem.product.name}": คืนได้อีก ${remainingQty} ชิ้น (ขอคืน ${refundItem.quantity} ชิ้น)`,
        );
      }
    }

    const totalRefund = dto.items.reduce((sum, item) => sum + item.refundPrice * item.quantity, 0);

    return this.prisma.$transaction(async (tx) => {
      const refund = await tx.saleRefund.create({
        data: {
          refundNumber: this.generateRefundNumber(),
          saleId: id,
          customerId: sale.customerId,
          createdById: userId,
          reason: dto.reason,
          paymentMethod: dto.paymentMethod as any,
          totalRefund,
          note: dto.note,
          items: {
            create: dto.items.map((item) => ({
              saleItemId: item.saleItemId,
              productId: sale.items.find((si) => si.id === item.saleItemId)!.productId,
              quantity: item.quantity,
              refundPrice: item.refundPrice,
              total: item.refundPrice * item.quantity,
            })),
          },
        },
        include: { items: true },
      });

      let allItemsFullyRefunded = true;

      for (const refundItem of dto.items) {
        const saleItem = sale.items.find((si) => si.id === refundItem.saleItemId)!;
        const newRefundedQty = saleItem.refundedQty + refundItem.quantity;

        await tx.saleItem.update({
          where: { id: refundItem.saleItemId },
          data: { refundedQty: newRefundedQty },
        });

        if (sale.branchId) {
          // Restore BranchStock for the branch this sale was made in
          await (tx as any).branchStock.upsert({
            where: { branchId_productId: { branchId: sale.branchId, productId: saleItem.productId } },
            create: { branchId: sale.branchId, productId: saleItem.productId, quantity: refundItem.quantity, minStock: 0 },
            update: { quantity: { increment: refundItem.quantity } },
          });
        }
        await tx.product.update({
          where: { id: saleItem.productId },
          data: { stock: { increment: refundItem.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId:  saleItem.productId,
            type:       'REFUND',
            quantity:   refundItem.quantity,
            saleItemId: refundItem.saleItemId,
            branchId:   sale.branchId ?? null,
            note:       `คืนเงิน ${sale.receiptNumber}: ${dto.reason}`,
          },
        });

        if (saleItem.product.hasSerial && newRefundedQty === saleItem.quantity) {
          await tx.serialNumber.updateMany({
            where: { saleItemId: refundItem.saleItemId },
            data: { status: 'RETURNED', soldAt: null },
          });
        }

        if (newRefundedQty < saleItem.quantity) allItemsFullyRefunded = false;
      }

      for (const saleItem of sale.items) {
        if (!dto.items.find((ri) => ri.saleItemId === saleItem.id)) {
          if (saleItem.refundedQty < saleItem.quantity) allItemsFullyRefunded = false;
        }
      }

      const newStatus = allItemsFullyRefunded ? 'REFUNDED' : 'PARTIAL_REFUND';
      await tx.sale.update({ where: { id }, data: { status: newStatus } });

      await this.auditLog.log({
        actorId: userId,
        action: 'SALE_REFUNDED',
        entityType: 'Sale',
        entityId: id,
        afterData: {
          refundNumber: refund.refundNumber,
          totalRefund,
          reason: dto.reason,
          itemCount: dto.items.length,
        },
      });

      if (totalRefund >= LARGE_REFUND_THRESHOLD) {
        await this.notif.notify({
          type:       'LARGE_REFUND',
          title:      `คืนเงินจำนวนมาก: ${totalRefund.toFixed(0)} บาท`,
          message:    `คืนเงิน ${totalRefund.toFixed(0)} บาท (เหตุผล: ${dto.reason ?? 'ไม่ระบุ'})`,
          severity:   'WARNING',
          entityType: 'Sale',
          entityId:   id,
        });
      }

      return { ...refund, saleStatus: newStatus };
    });
  }

  async voidSale(id: string, reason: string, userId: string, tenantId?: string | null) {
    const activeShift = await this.prisma.shift.findFirst({
      where: { userId, isActive: true },
      select: { id: true },
    });
    if (!activeShift) {
      throw new BadRequestException('กรุณาเปิดกะก่อนยกเลิกบิล');
    }

    const sale = await this.findOne(id, tenantId);

    if (sale.status === 'VOIDED') {
      throw new BadRequestException('บิลนี้ถูกยกเลิกไปแล้ว');
    }

    if (sale.shiftId) {
      const shift = await this.prisma.shift.findUnique({
        where: { id: sale.shiftId },
        select: { isActive: true },
      });
      if (shift && !shift.isActive) {
        throw new BadRequestException('ไม่สามารถยกเลิกบิลจากกะที่ปิดแล้ว');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.sale.update({
        where: { id },
        data: {
          status:     'VOIDED',
          voidedById: userId,
          voidedAt:   new Date(),
          voidReason: reason,
        },
      });

      const saleItemIds = sale.items.map((i) => i.id);
      await tx.serialNumber.updateMany({
        where: { saleItemId: { in: saleItemIds } },
        data: { status: 'IN_STOCK', saleItemId: null, soldAt: null, warrantyExpiresAt: null },
      });

      for (const item of sale.items) {
        if (sale.branchId) {
          // Restore BranchStock for the branch this sale was made in
          await (tx as any).branchStock.upsert({
            where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
            create: { branchId: sale.branchId, productId: item.productId, quantity: item.quantity, minStock: 0 },
            update: { quantity: { increment: item.quantity } },
          });
        }
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { increment: item.quantity } },
        });

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type:      'IN',
            quantity:  item.quantity,
            branchId:  sale.branchId ?? null,
            note:      `ยกเลิกบิล ${sale.receiptNumber}: ${reason}`,
          },
        });
      }

      await this.auditLog.log({
        actorId: userId,
        action: 'SALE_VOIDED',
        entityType: 'Sale',
        entityId: id,
        afterData: { status: 'VOIDED', voidReason: reason },
      });

      await this.notif.notify({
        type:       'VOID_SALE',
        title:      `บิลถูกยกเลิก: ${sale.receiptNumber}`,
        message:    `ยกเลิกบิล ${sale.receiptNumber} (ยอด ${Number(sale.total).toFixed(0)} บาท) — ${reason}`,
        severity:   'WARNING',
        entityType: 'Sale',
        entityId:   id,
      });

      return updated;
    });
  }
}
