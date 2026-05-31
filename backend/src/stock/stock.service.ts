import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class StockService {
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

  private async syncProductShadowStock(productId: string, tx?: any): Promise<void> {
    const db = tx ?? this.prisma;
    const result = await (db as any).branchStock.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    const total = (result._sum.quantity as number | null) ?? 0;
    await db.product.update({ where: { id: productId }, data: { stock: total } });
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

  async adjustStock(dto: AdjustStockDto, actorId?: string, actorName?: string) {
    // Controller guarantees dto.branchId is always set; guard defensively
    if (!dto.branchId) {
      throw new BadRequestException('กรุณาระบุสาขา (branchId is required)');
    }

    await this.assertBranchActive(dto.branchId);

    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    const isDeduction = dto.type === 'OUT';

    // Branch-scoped adjustment — BranchStock is the source of truth
    const bs = await (this.prisma as any).branchStock.findUnique({
      where: { branchId_productId: { branchId: dto.branchId, productId: dto.productId } },
    });
    const available = bs?.quantity ?? 0;

    if (isDeduction && available < dto.quantity) {
      throw new BadRequestException(
        `สต็อกสาขาไม่พอ คงเหลือ: ${available} ชิ้น`,
      );
    }

    const quantityChange = isDeduction ? -dto.quantity : dto.quantity;

    await this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.create({
        data: {
          productId: dto.productId,
          type:      dto.type as any,
          quantity:  dto.quantity,
          branchId:  dto.branchId,
          note:      dto.note,
        },
      });

      // Generate stockCode only when creating a new BranchStock row
      const stockCode = !bs ? await this.generateStockCode(dto.branchId!, tx) : null;

      await (tx as any).branchStock.upsert({
        where: { branchId_productId: { branchId: dto.branchId, productId: dto.productId } },
        create: {
          branchId:  dto.branchId,
          productId: dto.productId,
          quantity:  Math.max(0, dto.quantity),
          minStock:  0,
          ...(stockCode ? { stockCode } : {}),
        },
        update: { quantity: { increment: quantityChange } },
      });

      // Recalculate Product.stock = SUM of all BranchStock quantities
      await this.syncProductShadowStock(dto.productId, tx);
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'STOCK_ADJUSTED',
      entityType: 'Product',
      entityId: dto.productId,
      afterData: {
        type: dto.type, quantity: dto.quantity,
        branchId: dto.branchId ?? null, note: dto.note,
      },
    });

    if (isDeduction) {
      const updatedBs = await (this.prisma as any).branchStock.findUnique({
        where: { branchId_productId: { branchId: dto.branchId, productId: dto.productId } },
      });
      if (updatedBs && updatedBs.minStock > 0 && updatedBs.quantity <= updatedBs.minStock) {
        await this.notif.notifyLowStock(dto.productId, product.name, updatedBs.quantity, updatedBs.minStock);
      }
    }

    return { success: true, productId: dto.productId, branchId: dto.branchId ?? null };
  }

  async getMovements(productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) throw new NotFoundException('Product not found');

    return this.prisma.stockMovement.findMany({
      where: { productId },
      orderBy: { createdAt: 'desc' },
      include: { product: { select: { name: true, sku: true } } },
    });
  }

  async getLowStockProducts(branchId?: string) {
    const rows: any[] = branchId
      ? await this.prisma.$queryRaw`
          SELECT
            bs."productId" AS id,
            bs."productId",
            p.name,
            p.sku,
            CAST(bs.quantity AS INTEGER)    AS stock,
            CAST(bs."minStock" AS INTEGER)  AS "minStock",
            bs."branchId",
            b.name                          AS "branchName",
            bs."stockCode",
            CASE WHEN bs.quantity <= 0 THEN 'OUT_OF_STOCK' ELSE 'LOW_STOCK' END AS severity
          FROM "BranchStock" bs
          JOIN "Product" p ON p.id = bs."productId"
          JOIN "Branch"  b ON b.id = bs."branchId"
          WHERE p."isActive" = true
            AND bs."minStock" > 0
            AND bs.quantity <= bs."minStock"
            AND bs."branchId" = ${branchId}
          ORDER BY bs.quantity ASC, p.name ASC
        `
      : await this.prisma.$queryRaw`
          SELECT
            bs."productId" AS id,
            bs."productId",
            p.name,
            p.sku,
            CAST(bs.quantity AS INTEGER)    AS stock,
            CAST(bs."minStock" AS INTEGER)  AS "minStock",
            bs."branchId",
            b.name                          AS "branchName",
            bs."stockCode",
            CASE WHEN bs.quantity <= 0 THEN 'OUT_OF_STOCK' ELSE 'LOW_STOCK' END AS severity
          FROM "BranchStock" bs
          JOIN "Product" p ON p.id = bs."productId"
          JOIN "Branch"  b ON b.id = bs."branchId"
          WHERE p."isActive" = true
            AND bs."minStock" > 0
            AND bs.quantity <= bs."minStock"
          ORDER BY bs.quantity ASC, p.name ASC
        `;

    return rows.map((r) => ({
      id:         r.id,
      productId:  r.productId,
      name:       r.name,
      sku:        r.sku,
      stock:      Number(r.stock),
      minStock:   Number(r.minStock),
      branchId:   r.branchId,
      branchName: r.branchName,
      stockCode:  r.stockCode ?? null,
      severity:   r.severity as 'OUT_OF_STOCK' | 'LOW_STOCK',
    }));
  }
}
