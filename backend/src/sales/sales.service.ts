import { randomBytes } from 'crypto';
import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { activeShiftWhere } from '../shifts/active-shift';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService, LARGE_REFUND_THRESHOLD } from '../notifications/notifications.service';
import { AccountingService, ACCOUNTING_SOURCE } from '../accounting/accounting.service';
import { SalesAccountingAdapter } from './sales-accounting.adapter';
import { CreateSaleDto } from './dto/create-sale.dto';
import { RefundSaleDto } from './dto/refund-sale.dto';
import { ExchangeSaleDto } from './dto/exchange-sale.dto';
import { bangkokYmd } from '../common/bangkok-date';

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
    private accounting: AccountingService,
    private salesAccounting?: SalesAccountingAdapter,
  ) {}

  private async syncProductShadowStock(productId: string, tx: any): Promise<void> {
    const agg = await (tx as any).branchStock.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const total = (agg._sum.quantity as number | null) ?? 0;
    await tx.product.update({ where: { id: productId }, data: { stock: total } });
  }

  private async assertBranchActive(branchId: string, tenantId?: string | null) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { status: true, tenantId: true },
    });
    if (!branch) throw new NotFoundException('ไม่พบสาขา');
    // Tenant isolation: non-SUPER_ADMIN cannot create sales on another tenant's branch
    if (tenantId && branch.tenantId !== tenantId) {
      throw new ForbiddenException('ไม่มีสิทธิ์ใช้งานสาขานี้');
    }
    if ((branch as any).status !== 'ACTIVE') {
      throw new ForbiddenException('สาขานี้ยังไม่ได้รับการอนุมัติหรือถูกระงับการใช้งาน');
    }
  }

  private generateReceiptNumber(): string {
    const dateStr = bangkokYmd();
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `RCP-${dateStr}-${suffix}`;
  }

  private async resolveCustomerId(dto: CreateSaleDto, tenantId?: string | null): Promise<string | undefined> {
    if (dto.customerId) return dto.customerId;
    if (!dto.customerName) return undefined;

    if (dto.customerPhone) {
      const phoneWhere: any = { phone: dto.customerPhone };
      if (tenantId) phoneWhere.tenantId = tenantId;
      const existing = await this.prisma.customer.findFirst({ where: phoneWhere });
      if (existing) return existing.id;
    }

    const created = await this.prisma.customer.create({
      data: { name: dto.customerName, phone: dto.customerPhone, tags: [], ...(tenantId ? { tenantId } : {}) },
    });
    return created.id;
  }

  // P0-5 FIX: tx-aware version so customer creation is atomic with the sale.
  private async resolveCustomerIdInTx(tx: any, dto: CreateSaleDto, tenantId?: string | null): Promise<string | undefined> {
    if (dto.customerId) return dto.customerId;
    if (!dto.customerName) return undefined;

    if (dto.customerPhone) {
      const phoneWhere: any = { phone: dto.customerPhone };
      if (tenantId) phoneWhere.tenantId = tenantId;
      const existing = await tx.customer.findFirst({ where: phoneWhere });
      if (existing) return existing.id;
    }

    const created = await tx.customer.create({
      data: { name: dto.customerName, phone: dto.customerPhone, tags: [], ...(tenantId ? { tenantId } : {}) },
    });
    return created.id;
  }

  async create(dto: CreateSaleDto, userId: string, branchId?: string, tenantId?: string | null) {
    // Reject malformed payment input before any lookups.
    const hasSplit = !!dto.payments && dto.payments.length > 0;
    if (!hasSplit && (!dto.paymentMethod || dto.amountPaid === undefined)) {
      throw new BadRequestException('ต้องระบุ payments array หรือ paymentMethod + amountPaid');
    }

    if (branchId) await this.assertBranchActive(branchId, tenantId);

    const activeShift = await this.prisma.shift.findFirst({
      where: activeShiftWhere(userId),
      select: { id: true },
    });
    if (!activeShift) {
      throw new BadRequestException('กรุณาเปิดกะก่อนทำรายการขาย');
    }

    // The seller must be an active member of this shop
    let sellerId: string | null = null;
    if (dto.sellerId && dto.sellerId !== userId) {
      const seller = await this.prisma.user.findFirst({
        where: { id: dto.sellerId, isActive: true, ...(tenantId ? { tenantId } : {}) },
        select: { id: true },
      });
      if (!seller) throw new BadRequestException('ไม่พบพนักงานขายที่เลือก');
      sellerId = seller.id;
    }

    const productIds = dto.items.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true, ...(tenantId ? { tenantId } : {}) },
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

    // Normalize payment input: split array OR legacy single method
    const paymentLegs = hasSplit
      ? dto.payments!.map((p) => ({ paymentMethod: p.paymentMethod, amount: p.amount }))
      : [{ paymentMethod: dto.paymentMethod!, amount: dto.amountPaid! }];

    const totalPaid = paymentLegs.reduce((s, leg) => s + leg.amount, 0);
    const change    = totalPaid - total;

    if (change < 0) {
      throw new BadRequestException('Amount paid is less than total');
    }

    // Stored payment legs = money the shop keeps. The amount tendered (Sale.amountPaid) and the
    // change stay on the Sale for the receipt, but change handed back must not count as cash
    // received — otherwise shift expected cash and the cash-drawer ledger are inflated.
    const appliedLegs = this.applyChangeToLegs(paymentLegs, change);

    // Primary method = largest leg (used in Sale.paymentMethod for legacy reports)
    const primaryMethod = [...paymentLegs].sort((a, b) => b.amount - a.amount)[0].paymentMethod;

    const sale = await this.prisma.$transaction(async (tx) => {
      // P0-5 FIX: resolve/create customer inside the transaction so a concurrent
      // sale with the same new phone number cannot create two Customer rows.
      const customerId = await this.resolveCustomerIdInTx(tx, dto, tenantId);

      const sale = await tx.sale.create({
        data: {
          receiptNumber: this.generateReceiptNumber(),
          userId,
          sellerId,
          customerId,
          shiftId: activeShift.id,
          branchId: branchId ?? null,
          paymentMethod: primaryMethod as any,
          subtotal,
          discount,
          total,
          amountPaid: totalPaid,
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
          payments: {
            create: appliedLegs.map((leg, i) => ({
              paymentMethod: leg.paymentMethod as any,
              amount: leg.amount,
              sortOrder: i,
            })),
          },
        },
        include: {
          items: { include: { product: { select: { name: true, sku: true } } } },
          customer: { select: { id: true, name: true, phone: true } },
          user: { select: { id: true, name: true } },
          payments: { orderBy: { sortOrder: 'asc' } },
        },
      });

      // Build per-productId queue so duplicate products map to distinct SaleItems
      const saleItemQueue = new Map<string, Array<(typeof sale.items)[number]>>();
      for (const si of sale.items) {
        const q = saleItemQueue.get(si.productId) ?? [];
        q.push(si);
        saleItemQueue.set(si.productId, q);
      }

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
          // Recalculate Product.stock shadow from SUM(BranchStock) — prevents drift
          await this.syncProductShadowStock(item.productId, tx);
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

        const saleItem = saleItemQueue.get(item.productId)?.shift();
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

      // Record each payment leg in accounting ledger (CASH → cash drawer; others → audit-only)
      if (branchId) {
        for (const payment of sale.payments) {
          await this.accounting.record({
            sourceType:    ACCOUNTING_SOURCE.SALE_PAYMENT,
            sourceId:      payment.id,
            paymentMethod: payment.paymentMethod as any,
            amount:        Number(payment.amount),
            direction:     'IN',
            branchId,
            tenantId:      tenantId ?? null,
            actorUserId:   userId,
            note:          sale.receiptNumber,
          }, tx);
        }
      }

      // P0-5/6 FIX: use logWithTx so the audit row rolls back if the sale tx rolls back.
      await this.auditLog.logWithTx(tx, {
        actorId:    userId,
        action:     'SALE_CREATED',
        entityType: 'Sale',
        entityId:   sale.id,
        afterData: {
          receiptNumber: sale.receiptNumber,
          total:         Number(sale.total),
          paymentMethod: sale.paymentMethod,
          payments:      sale.payments.map((p) => ({ method: p.paymentMethod, amount: Number(p.amount) })),
          itemCount:     sale.items.length,
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

    // Post-transaction: accounting journal (ACCOUNTING_CORE_ENABLED gates this; never throws)
    await this.salesAccounting?.recordSaleJournal(sale as any, tenantId ?? '', userId);

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
        payments: { orderBy: { sortOrder: 'asc' } },
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
        payments: { orderBy: { sortOrder: 'asc' } },
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
    const dateStr = bangkokYmd();
    const suffix = randomBytes(3).toString('hex').toUpperCase();
    return `REF-${dateStr}-${suffix}`;
  }

  // Deduct change from the payment legs: cash legs first (change is given in cash), then any
  // other leg, largest first. Returns legs that sum exactly to the sale total.
  private applyChangeToLegs(legs: { paymentMethod: string; amount: number }[], change: number) {
    let left = Math.round(change * 100) / 100;
    if (left <= 0) return legs.map((l) => ({ ...l }));

    const out   = legs.map((l) => ({ ...l }));
    const order = out
      .map((l, i) => ({ l, i }))
      .sort((a, b) =>
        (a.l.paymentMethod === 'CASH' ? 0 : 1) - (b.l.paymentMethod === 'CASH' ? 0 : 1) || b.l.amount - a.l.amount);
    for (const { l } of order) {
      if (left <= 0) break;
      const take = Math.min(l.amount, left);
      l.amount = Math.round((l.amount - take) * 100) / 100;
      left     = Math.round((left - take) * 100) / 100;
    }
    return out.filter((l) => l.amount > 0);
  }

  // Authoritative refund guard — must run inside the refund/exchange transaction.
  // Locks the sale row so refunds/exchanges of the same bill run one at a time, then re-checks
  // against fresh data: remaining quantity, refund price ≤ what the customer paid per unit,
  // and total refunds ≤ the bill total. Returns the current refundedQty per sale item.
  private async lockAndValidateRefund(
    tx: any,
    saleId: string,
    items: { saleItemId: string; quantity: number; refundPrice: number }[],
  ): Promise<Map<string, number>> {
    await tx.$queryRaw`SELECT id FROM "Sale" WHERE id = ${saleId} FOR UPDATE`;
    const sale = await tx.sale.findUniqueOrThrow({
      where:  { id: saleId },
      select: {
        status: true,
        total:  true,
        items:  { select: { id: true, quantity: true, refundedQty: true, total: true, product: { select: { name: true } } } },
      },
    });
    if (sale.status === 'VOIDED')   throw new BadRequestException('ไม่สามารถคืนเงินบิลที่ยกเลิกแล้ว');
    if (sale.status === 'REFUNDED') throw new BadRequestException('บิลนี้ถูกคืนเงินครบแล้ว');

    // Same sale item listed twice counts as one combined request
    const requestedQty = new Map<string, number>();
    for (const it of items) requestedQty.set(it.saleItemId, (requestedQty.get(it.saleItemId) ?? 0) + it.quantity);

    for (const it of items) {
      const si = sale.items.find((x: any) => x.id === it.saleItemId);
      if (!si) throw new NotFoundException(`SaleItem ${it.saleItemId} not found in this sale`);

      const remaining = si.quantity - si.refundedQty;
      if (requestedQty.get(it.saleItemId)! > remaining) {
        throw new BadRequestException(
          `สินค้า "${si.product.name}": คืนได้อีก ${remaining} ชิ้น (ขอคืน ${requestedQty.get(it.saleItemId)} ชิ้น)`,
        );
      }

      const paidPerUnit = Math.round((Number(si.total) / si.quantity) * 100) / 100;
      if (it.refundPrice > paidPerUnit + 0.005) {
        throw new BadRequestException(
          `สินค้า "${si.product.name}": คืนได้ไม่เกิน ${paidPerUnit.toFixed(2)} บาทต่อชิ้น (ราคาที่ลูกค้าจ่าย)`,
        );
      }
    }

    const prior     = await tx.saleRefund.aggregate({ where: { saleId }, _sum: { totalRefund: true } });
    const refunded  = Number(prior._sum.totalRefund ?? 0);
    const requested = items.reduce((sum, it) => sum + it.refundPrice * it.quantity, 0);
    const billTotal = Number(sale.total);
    if (refunded + requested > billTotal + 0.005) {
      const left = Math.max(0, Math.round((billTotal - refunded) * 100) / 100);
      throw new BadRequestException(`ยอดคืนเงินรวมเกินยอดบิล (คืนได้อีก ${left.toFixed(2)} บาท)`);
    }

    return new Map(sale.items.map((x: any) => [x.id, x.refundedQty] as [string, number]));
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

    // The refund leaves from the shift open now (not the shift of the sale, which may be closed)
    const refundShift = await this.prisma.shift.findFirst({ where: activeShiftWhere(userId), select: { id: true } });
    if (!refundShift && dto.paymentMethod === 'CASH') {
      throw new BadRequestException('กรุณาเปิดกะก่อนคืนเงินสด');
    }

    const refundResult = await this.prisma.$transaction(async (tx) => {
      const refundedQty = await this.lockAndValidateRefund(tx, id, dto.items);

      const refund = await tx.saleRefund.create({
        data: {
          refundNumber: this.generateRefundNumber(),
          saleId: id,
          shiftId: refundShift?.id ?? null,
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
        const newRefundedQty = refundedQty.get(refundItem.saleItemId)! + refundItem.quantity;
        refundedQty.set(refundItem.saleItemId, newRefundedQty);

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
          // Recalculate Product.stock from SUM(BranchStock) — prevents drift
          await this.syncProductShadowStock(saleItem.productId, tx);
        } else {
          // Legacy no-branch sale: restore Product.stock directly
          await tx.product.update({
            where: { id: saleItem.productId },
            data: { stock: { increment: refundItem.quantity } },
          });
        }

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
            // Back in stock (quantity was restored above) → sellable again, same as void
            data: { status: 'IN_STOCK', saleItemId: null, soldAt: null, warrantyExpiresAt: null },
          });
        }

      }

      for (const saleItem of sale.items) {
        if (refundedQty.get(saleItem.id)! < saleItem.quantity) allItemsFullyRefunded = false;
      }

      const newStatus = allItemsFullyRefunded ? 'REFUNDED' : 'PARTIAL_REFUND';
      await tx.sale.update({ where: { id }, data: { status: newStatus } });

      // Record CASH refund in Cash Drawer ledger (OUT — cash leaves drawer back to customer)
      if (sale.branchId) {
        await this.accounting.record({
          sourceType:    ACCOUNTING_SOURCE.SALE_REFUND,
          sourceId:      refund.id,
          paymentMethod: dto.paymentMethod as any,
          amount:        totalRefund,
          direction:     'OUT',
          branchId:      sale.branchId,
          tenantId:      tenantId ?? null,
          actorUserId:   userId,
          note:          refund.refundNumber,
        }, tx);
      }

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

    // Post-transaction: refund accounting journal (ACCOUNTING_CORE_ENABLED gates; never throws)
    await this.salesAccounting?.recordRefundJournal(
      {
        id:            refundResult.id,
        totalRefund:   refundResult.totalRefund,
        paymentMethod: refundResult.paymentMethod,
        saleId:        id,
      },
      sale as any,
      dto.items.map((ri) => ({ saleItemId: ri.saleItemId, quantity: ri.quantity })),
      tenantId ?? '',
      userId,
    );

    return refundResult;
  }

  async voidSale(id: string, reason: string, userId: string, tenantId?: string | null) {
    const activeShift = await this.prisma.shift.findFirst({
      where: activeShiftWhere(userId),
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

    const voidResult = await this.prisma.$transaction(async (tx) => {
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
        // Only restore stock that wasn't already returned via partial refund
        const restoreQty = item.quantity - (item.refundedQty ?? 0);
        if (restoreQty <= 0) continue;

        if (sale.branchId) {
          // Restore BranchStock for the branch this sale was made in
          await (tx as any).branchStock.upsert({
            where: { branchId_productId: { branchId: sale.branchId, productId: item.productId } },
            create: { branchId: sale.branchId, productId: item.productId, quantity: restoreQty, minStock: 0 },
            update: { quantity: { increment: restoreQty } },
          });
          // Recalculate Product.stock from SUM(BranchStock) — prevents drift
          await this.syncProductShadowStock(item.productId, tx);
        } else {
          // Legacy no-branch sale: BranchStock doesn't exist, restore Product.stock directly
          await tx.product.update({
            where: { id: item.productId },
            data: { stock: { increment: restoreQty } },
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: item.productId,
            type:      'IN',
            quantity:  restoreQty,
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

      // Reverse accounting ledger for each payment leg
      if (sale.branchId) {
        const salePayments = (sale as any).payments as Array<{ id: string; paymentMethod: string; amount: any }> | undefined;
        if (salePayments && salePayments.length > 0) {
          // New format: reverse each leg using its SalePayment.id as sourceId
          for (const leg of salePayments) {
            await this.accounting.record(
              {
                sourceType:    ACCOUNTING_SOURCE.SALE_REFUND,
                sourceId:      leg.id,
                direction:     'OUT',
                amount:        Number(leg.amount),
                paymentMethod: leg.paymentMethod as any,
                branchId:      sale.branchId,
                tenantId:      tenantId ?? null,
                actorUserId:   userId,
                note:          `ยกเลิกบิล ${sale.receiptNumber}: ${reason}`,
              },
              tx,
            );
          }
        } else if (sale.paymentMethod === 'CASH') {
          // Backward compat: old sales without SalePayment rows — only CASH was tracked
          await this.accounting.record(
            {
              sourceType:    ACCOUNTING_SOURCE.SALE_REFUND,
              sourceId:      id,
              direction:     'OUT',
              amount:        Number(sale.total),
              paymentMethod: 'CASH',
              branchId:      sale.branchId,
              tenantId:      tenantId ?? null,
              actorUserId:   userId,
              note:          `ยกเลิกบิล ${sale.receiptNumber}: ${reason}`,
            },
            tx,
          );
        }
      }

      return updated;
    });

    // Post-transaction: reverse accounting journals (ACCOUNTING_CORE_ENABLED gates; never throws)
    await this.salesAccounting?.reverseSaleJournal(sale as any, tenantId ?? '', userId);

    return voidResult;
  }

  async exchangeSaleItems(id: string, dto: ExchangeSaleDto, userId: string, tenantId?: string | null) {
    const saleWhere: any = { id };
    if (tenantId) saleWhere.branch = { tenantId };

    const sale = await this.prisma.sale.findFirst({
      where: saleWhere,
      include: {
        items: {
          include: { product: { select: { id: true, name: true, hasSerial: true, costPrice: true } } },
        },
        branch: { select: { id: true } },
      },
    });

    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status === 'VOIDED')   throw new BadRequestException('ไม่สามารถเปลี่ยนสินค้าในบิลที่ยกเลิกแล้ว');
    if (sale.status === 'REFUNDED') throw new BadRequestException('บิลนี้ถูกคืนเงินครบแล้ว');
    if (dto.returnItems.length === 0) throw new BadRequestException('ต้องระบุสินค้าที่ต้องการคืนอย่างน้อย 1 รายการ');
    if (dto.newItems.length === 0)    throw new BadRequestException('ต้องระบุสินค้าที่ต้องการเปลี่ยนอย่างน้อย 1 รายการ');

    // Validate return quantities
    for (const ri of dto.returnItems) {
      const saleItem = sale.items.find((si) => si.id === ri.saleItemId);
      if (!saleItem) throw new NotFoundException(`SaleItem ${ri.saleItemId} not found in this sale`);
      const remaining = saleItem.quantity - saleItem.refundedQty;
      if (ri.quantity > remaining) {
        throw new BadRequestException(
          `สินค้า "${saleItem.product.name}": คืนได้อีก ${remaining} ชิ้น (ขอคืน ${ri.quantity} ชิ้น)`,
        );
      }
    }

    // Validate replacement products exist and have stock
    const newProductIds = dto.newItems.map((i) => i.productId);
    const products = await this.prisma.product.findMany({
      where: { id: { in: newProductIds }, isActive: true, ...(tenantId ? { tenantId } : {}) },
    });
    if (products.length !== new Set(newProductIds).size) {
      throw new NotFoundException('One or more replacement products not found');
    }

    const demandMap = new Map<string, number>();
    for (const ni of dto.newItems) {
      demandMap.set(ni.productId, (demandMap.get(ni.productId) ?? 0) + ni.quantity);
    }

    if (sale.branchId) {
      const bsRows = await this.prisma.branchStock.findMany({
        where: { branchId: sale.branchId, productId: { in: newProductIds } },
        select: { productId: true, quantity: true },
      });
      const bsMap = new Map(bsRows.map((r) => [r.productId, r.quantity]));
      for (const [pid, totalQty] of demandMap) {
        const product = products.find((p) => p.id === pid)!;
        const available = bsMap.get(pid) ?? 0;
        if (available < totalQty) {
          throw new BadRequestException(`สต็อกไม่พอสำหรับ "${product.name}" คงเหลือ: ${available} ชิ้น`);
        }
      }
    } else {
      for (const [pid, totalQty] of demandMap) {
        const product = products.find((p) => p.id === pid)!;
        if (product.stock < totalQty) {
          throw new BadRequestException(`สต็อกไม่พอสำหรับ "${product.name}" คงเหลือ: ${product.stock} ชิ้น`);
        }
      }
    }

    const activeShift = await this.prisma.shift.findFirst({
      where: activeShiftWhere(userId),
      select: { id: true },
    });
    if (!activeShift) throw new BadRequestException('กรุณาเปิดกะก่อนทำรายการเปลี่ยนสินค้า');

    const refundTotal = dto.returnItems.reduce((sum, ri) => sum + ri.refundPrice * ri.quantity, 0);
    const newTotal    = dto.newItems.reduce((sum, ni) => sum + ni.price * ni.quantity, 0);

    const txResult = await this.prisma.$transaction(async (tx) => {
      const refundedQty = await this.lockAndValidateRefund(tx, id, dto.returnItems);

      // A. Record returned items as a SaleRefund
      const refundNumber = this.generateRefundNumber();
      const refund = await tx.saleRefund.create({
        data: {
          refundNumber,
          saleId: id,
          shiftId: activeShift.id,
          customerId: sale.customerId,
          createdById: userId,
          reason: dto.reason,
          paymentMethod: dto.paymentMethod as any,
          totalRefund: refundTotal,
          note: dto.note,
          items: {
            create: dto.returnItems.map((ri) => ({
              saleItemId: ri.saleItemId,
              productId: sale.items.find((si) => si.id === ri.saleItemId)!.productId,
              quantity: ri.quantity,
              refundPrice: ri.refundPrice,
              total: ri.refundPrice * ri.quantity,
            })),
          },
        },
      });

      let allItemsFullyRefunded = true;

      for (const ri of dto.returnItems) {
        const saleItem = sale.items.find((si) => si.id === ri.saleItemId)!;
        const newRefundedQty = refundedQty.get(ri.saleItemId)! + ri.quantity;
        refundedQty.set(ri.saleItemId, newRefundedQty);

        await tx.saleItem.update({
          where: { id: ri.saleItemId },
          data: { refundedQty: newRefundedQty },
        });

        if (sale.branchId) {
          await (tx as any).branchStock.upsert({
            where: { branchId_productId: { branchId: sale.branchId, productId: saleItem.productId } },
            create: { branchId: sale.branchId, productId: saleItem.productId, quantity: ri.quantity, minStock: 0 },
            update: { quantity: { increment: ri.quantity } },
          });
          await this.syncProductShadowStock(saleItem.productId, tx);
        } else {
          await tx.product.update({ where: { id: saleItem.productId }, data: { stock: { increment: ri.quantity } } });
        }

        await tx.stockMovement.create({
          data: {
            productId:  saleItem.productId,
            type:       'REFUND',
            quantity:   ri.quantity,
            saleItemId: ri.saleItemId,
            branchId:   sale.branchId ?? null,
            note:       `เปลี่ยนสินค้า ${sale.receiptNumber}: ${dto.reason}`,
          },
        });

        if (saleItem.product.hasSerial && newRefundedQty === saleItem.quantity) {
          await tx.serialNumber.updateMany({
            where: { saleItemId: ri.saleItemId },
            // Back in stock (quantity was restored above) → sellable again, same as void
            data: { status: 'IN_STOCK', saleItemId: null, soldAt: null, warrantyExpiresAt: null },
          });
        }

      }

      for (const si of sale.items) {
        if (refundedQty.get(si.id)! < si.quantity) allItemsFullyRefunded = false;
      }

      const newSaleStatus = allItemsFullyRefunded ? 'REFUNDED' : 'PARTIAL_REFUND';
      await tx.sale.update({ where: { id }, data: { status: newSaleStatus } });

      // B. Create new Sale for replacement items — include payments + items for post-commit accounting
      const newReceiptNumber = this.generateReceiptNumber();
      const newSale = await tx.sale.create({
        data: {
          receiptNumber: newReceiptNumber,
          userId,
          customerId: sale.customerId,
          shiftId: activeShift.id,
          branchId: sale.branchId ?? null,
          paymentMethod: dto.paymentMethod as any,
          subtotal: newTotal,
          discount: 0,
          total: newTotal,
          amountPaid: newTotal,
          change: 0,
          note: `เปลี่ยนสินค้าจาก ${sale.receiptNumber}${dto.note ? ` — ${dto.note}` : ''}`,
          status: 'COMPLETED',
          items: {
            create: dto.newItems.map((ni) => {
              const product = products.find((p) => p.id === ni.productId)!;
              return {
                productId:   ni.productId,
                quantity:    ni.quantity,
                price:       ni.price,
                costPrice:   Number(product.costPrice ?? 0),
                discount:    0,
                total:       ni.price * ni.quantity,
                refundedQty: 0,
              };
            }),
          },
          payments: {
            create: [{ paymentMethod: dto.paymentMethod as any, amount: newTotal, sortOrder: 0 }],
          },
        },
        // FIX BUG-2 + BUG-3: fetch created SaleItems and SalePayments so we can
        // link StockMovements and use SalePayment.id for the CDT sourceId.
        include: { items: true, payments: true },
      });

      // Build a per-productId queue so duplicate products map to distinct SaleItems
      const newSaleItemQueue = new Map<string, string[]>();
      for (const si of newSale.items) {
        const q = newSaleItemQueue.get(si.productId) ?? [];
        q.push(si.id);
        newSaleItemQueue.set(si.productId, q);
      }

      for (const ni of dto.newItems) {
        if (sale.branchId) {
          // FIX BUG-1: atomic conditional decrement — prevents concurrent oversell.
          // updateMany with quantity >= demand only writes if stock remains sufficient.
          const bsResult = await (tx as any).branchStock.updateMany({
            where: { branchId: sale.branchId, productId: ni.productId, quantity: { gte: ni.quantity } },
            data: { quantity: { decrement: ni.quantity } },
          });
          if (bsResult.count === 0) {
            const bs = await (tx as any).branchStock.findUnique({
              where: { branchId_productId: { branchId: sale.branchId, productId: ni.productId } },
              select: { quantity: true },
            });
            const product = products.find((p) => p.id === ni.productId)!;
            throw new BadRequestException(
              `สต็อกไม่พอสำหรับ "${product.name}" คงเหลือ: ${bs?.quantity ?? 0} ชิ้น (ต้องการ: ${ni.quantity})`,
            );
          }
          await this.syncProductShadowStock(ni.productId, tx);
        } else {
          // FIX BUG-1 (no-branch path): atomic conditional decrement
          const prodResult = await tx.product.updateMany({
            where: { id: ni.productId, stock: { gte: ni.quantity } },
            data: { stock: { decrement: ni.quantity } },
          });
          if (prodResult.count === 0) {
            const product = products.find((p) => p.id === ni.productId)!;
            throw new BadRequestException(
              `สต็อกไม่พอสำหรับ "${product.name}" (สต็อกถูกอัพเดทโดย request อื่น)`,
            );
          }
        }

        // FIX BUG-2: link saleItemId to the replacement SaleItem
        const saleItemId = newSaleItemQueue.get(ni.productId)?.shift();
        await tx.stockMovement.create({
          data: {
            productId:  ni.productId,
            type:       'SALE',
            quantity:   ni.quantity,
            saleItemId: saleItemId ?? undefined,
            branchId:   sale.branchId ?? null,
            note:       `เปลี่ยนสินค้าจาก ${sale.receiptNumber}`,
          },
        });
      }

      // C. Accounting: record return OUT + new sale IN separately for clear audit trail
      if (sale.branchId) {
        await this.accounting.record({
          sourceType:    ACCOUNTING_SOURCE.SALE_REFUND,
          sourceId:      refund.id,
          paymentMethod: dto.paymentMethod as any,
          amount:        refundTotal,
          direction:     'OUT',
          branchId:      sale.branchId,
          tenantId:      tenantId ?? null,
          actorUserId:   userId,
          note:          refundNumber,
        }, tx);

        // FIX BUG-3: use SalePayment.id (not newSale.id) for idempotency consistency
        await this.accounting.record({
          sourceType:    ACCOUNTING_SOURCE.SALE_PAYMENT,
          sourceId:      newSale.payments[0].id,
          paymentMethod: dto.paymentMethod as any,
          amount:        newTotal,
          direction:     'IN',
          branchId:      sale.branchId,
          tenantId:      tenantId ?? null,
          actorUserId:   userId,
          note:          newReceiptNumber,
        }, tx);
      }

      // FIX BUG-5: use logWithTx so audit row rolls back if $transaction rolls back
      await this.auditLog.logWithTx(tx, {
        actorId: userId,
        action: 'SALE_EXCHANGED',
        entityType: 'Sale',
        entityId: id,
        afterData: {
          refundNumber,
          newReceiptNumber,
          returnItemCount: dto.returnItems.length,
          newItemCount: dto.newItems.length,
          refundTotal,
          newTotal,
          netAmount: newTotal - refundTotal,
        },
      });

      return {
        txData: {
          originalSaleStatus: newSaleStatus,
          refundNumber,
          refundTotal,
          newReceiptNumber,
          newTotal,
          netAmount: newTotal - refundTotal,
        },
        newSale,
        refundId: refund.id,
      };
    });

    // FIX BUG-4: post-commit double-entry journals (no-throw; never affects Exchange result)
    // Return leg: revenue reversal + COGS reversal per returned item
    await this.salesAccounting?.recordRefundJournal(
      {
        id:            txResult.refundId,
        totalRefund:   refundTotal,
        paymentMethod: dto.paymentMethod,
        saleId:        id,
      },
      sale as any,
      dto.returnItems.map((ri) => ({ saleItemId: ri.saleItemId, quantity: ri.quantity })),
      tenantId ?? '',
      userId,
    );
    // Replacement leg: revenue + COGS per new SaleItem
    await this.salesAccounting?.recordSaleJournal(txResult.newSale as any, tenantId ?? '', userId);

    // FIX BUG-7: low-stock notifications for replacement products.
    // Wrapped in try/catch so notification failures never affect Exchange business result.
    try {
      for (const ni of dto.newItems) {
        const p = await this.prisma.product.findUnique({
          where: { id: ni.productId },
          select: { id: true, name: true, stock: true, minStock: true },
        });
        if (p) await this.notif.notifyLowStock(p.id, p.name, p.stock, p.minStock);
      }
    } catch {
      // Notification failure is non-fatal — Exchange is already committed
    }

    return txResult.txData;
  }
}
