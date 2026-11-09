import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { JournalService } from '../journal/journal.service';
import { ModulesService } from '../modules/modules.service';
import { ACCOUNT_CODES } from '../accounting-accounts/constants/account-codes';

/**
 * The owner corrects a product's cost when it was typed wrong (150,000 for a 15,000 phone) or
 * never entered (0), and, if they choose, the bills already sold with that wrong cost.
 *
 * A bill line keeps the cost it was sold at, so fixing the product alone changes only the next
 * sales. With `fixBills`, the lines whose cost is plainly wrong are changed too: no cost (0), or
 * a cost above what that line sold for. Lines sold at a sensible cost are left alone, whatever
 * the new cost, because that was the real cost on that day. Nothing else on the bill changes:
 * what the customer paid, stock and receipts stay as they were.
 *
 * Every fix is kept in the audit log (product cost and each line, before and after). When the
 * shop keeps books, the difference is booked as a cost-of-goods adjustment on the day of the fix
 * (the original entries stay, so the books keep their history).
 */
@Injectable()
export class CostFixService {
  private readonly logger = new Logger(CostFixService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly journal: JournalService,
    private readonly modules: ModulesService,
  ) {}

  /** The bill lines of a product whose cost is plainly wrong, newest first */
  private async wrongLines(productId: string, tenantId: string) {
    const lines = await this.prisma.saleItem.findMany({
      where: { productId, sale: { status: { not: 'VOIDED' }, branch: { tenantId } } },
      select: {
        id: true, quantity: true, costPrice: true, total: true, isFreebie: true,
        sale: { select: { id: true, receiptNumber: true, createdAt: true, branchId: true } },
      },
      orderBy: { sale: { createdAt: 'desc' } },
    });
    return lines.filter((l) => {
      const cost = Number(l.costPrice);
      if (cost <= 0) return true;
      if (l.isFreebie) return false;
      const unit = l.quantity > 0 ? Number(l.total) / l.quantity : 0;
      return cost > unit;
    });
  }

  async preview(productId: string, tenantId: string, costPrice?: number) {
    const product = await this.product(productId, tenantId);
    const lines = await this.wrongLines(productId, tenantId);
    return {
      product: { id: product.id, name: product.name, price: Number(product.price), costPrice: Number(product.costPrice) },
      lines: lines.map((l) => ({
        id: l.id,
        saleId: l.sale.id,
        receiptNumber: l.sale.receiptNumber,
        date: l.sale.createdAt.toISOString(),
        quantity: l.quantity,
        soldFor: Number(l.total),
        costPrice: Number(l.costPrice),
        isFreebie: l.isFreebie,
      })),
      /** how much the profit of those bills moves once fixed (+ = profit goes up) */
      profitChange: costPrice == null ? null
        : round2(lines.reduce((s, l) => s + (Number(l.costPrice) - costPrice) * l.quantity, 0)),
    };
  }

  async fix(
    p: { productId: string; costPrice: number; fixBills: boolean },
    user: { id: string; name?: string | null; tenantId: string },
  ) {
    if (!(p.costPrice > 0)) throw new BadRequestException('ใส่ราคาทุนที่มากกว่า 0');
    const product = await this.product(p.productId, user.tenantId);
    const lines = p.fixBills ? await this.wrongLines(p.productId, user.tenantId) : [];

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id: product.id }, data: { costPrice: p.costPrice } });
      for (const l of lines) await tx.saleItem.update({ where: { id: l.id }, data: { costPrice: p.costPrice } });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          actorName: user.name ?? null,
          action: 'PRODUCT_COST_FIXED',
          entityType: 'Product',
          entityId: product.id,
          beforeData: {
            costPrice: Number(product.costPrice),
            lines: lines.map((l) => ({ saleItemId: l.id, receiptNumber: l.sale.receiptNumber, costPrice: Number(l.costPrice), quantity: l.quantity })),
          },
          afterData: { costPrice: p.costPrice, linesFixed: lines.length },
          metadata: { tenantId: user.tenantId },
        },
      });
    });

    // Books: the difference of each fixed line, on the day of the fix (post-commit, never blocks)
    if (lines.length && await this.modules.isAccountingEnabled(user.tenantId).catch(() => false)) {
      const stamp = Date.now().toString(36);
      for (const l of lines) {
        const diff = new Prisma.Decimal(p.costPrice).minus(String(l.costPrice)).times(l.quantity).toDecimalPlaces(2);
        if (diff.isZero()) continue;
        const amt = diff.abs().toString();
        const up = diff.gt(0); // cost goes up → more cost of goods, less stock value
        await this.journal.create({
          tenantId: user.tenantId,
          branchId: l.sale.branchId,
          entryDate: new Date(),
          description: `แก้ทุน ${product.name} — บิล ${l.sale.receiptNumber}`,
          sourceType: 'SALE_COGS_ADJUST',
          sourceId: `${l.id}:${stamp}`,
          sourceRef: l.sale.receiptNumber,
          postedById: user.id,
          lines: up
            ? [{ accountCode: ACCOUNT_CODES.COGS, debit: amt }, { accountCode: ACCOUNT_CODES.INVENTORY, credit: amt }]
            : [{ accountCode: ACCOUNT_CODES.INVENTORY, debit: amt }, { accountCode: ACCOUNT_CODES.COGS, credit: amt }],
        }).catch((e) => this.logger.warn(`cost fix journal for saleItem ${l.id}: ${(e as Error).message}`));
      }
    }

    return {
      productId: product.id,
      costPrice: p.costPrice,
      linesFixed: lines.length,
      profitChange: round2(lines.reduce((s, l) => s + (Number(l.costPrice) - p.costPrice) * l.quantity, 0)),
    };
  }

  private async product(id: string, tenantId: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      select: { id: true, name: true, price: true, costPrice: true },
    });
    if (!product) throw new NotFoundException('ไม่พบสินค้านี้ในร้าน');
    return product;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;
