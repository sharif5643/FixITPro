import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { EnrollBranchDto } from './dto/enroll-branch.dto';

const SKU_PREFIX: Record<string, string> = {
  PHONE: 'PHONE',
  SIM: 'SIM',
  ACCESSORY: 'ACC',
  PART: 'PART',
};

@Injectable()
export class ProductsService {
  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private tenantSvc: TenantService,
  ) {}

  async generateSku(type: string, tenantId?: string | null): Promise<{ sku: string }> {
    const prefix = SKU_PREFIX[type] ?? type.slice(0, 4).toUpperCase();
    const existing = await this.prisma.product.findMany({
      where: { sku: { startsWith: `${prefix}-` }, ...this.tenantSvc.scope(tenantId) },
      select: { sku: true },
    });

    let maxNum = 0;
    for (const { sku } of existing) {
      const n = parseInt(sku.split('-').pop() ?? '0', 10);
      if (!isNaN(n) && n > maxNum) maxNum = n;
    }

    const sku = `${prefix}-${String(maxNum + 1).padStart(6, '0')}`;
    return { sku };
  }

  async generateBarcode(): Promise<{ barcode: string }> {
    let barcode = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      const digits = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
      const checksum = digits.reduce((s, d, i) => s + d * (i % 2 === 0 ? 1 : 3), 0);
      const check = (10 - (checksum % 10)) % 10;
      barcode = [...digits, check].join('');
      const exists = await this.prisma.product.findFirst({ where: { barcode } });
      if (!exists) break;
    }
    return { barcode };
  }

  private async syncProductShadowStock(productId: string, tx: any): Promise<void> {
    const agg = await (tx as any).branchStock.aggregate({
      where: { productId },
      _sum: { quantity: true },
    });
    await tx.product.update({
      where: { id: productId },
      data: { stock: (agg._sum.quantity as number | null) ?? 0 },
    });
  }

  // Mirrors StockService.generateStockCode — increments stockCodeSeq atomically
  // inside the given transaction so the whole create is rolled back on failure.
  private async generateStockCode(branchId: string, tx: any): Promise<string | null> {
    const branch = await tx.branch.update({
      where: { id: branchId },
      data: { stockCodeSeq: { increment: 1 } },
      select: { branchNumber: true, stockCodeSeq: true },
    });
    if (!branch.branchNumber) return null;
    return `SK${branch.branchNumber}-${String(branch.stockCodeSeq).padStart(6, '0')}`;
  }

  async create(
    dto: CreateProductDto,
    actorId?: string,
    actorName?: string,
    userBranchId?: string | null,
    userRole?: string,
    tenantId?: string | null,
  ) {
    const isPrivileged = userRole === 'OWNER' || userRole === 'SUPER_ADMIN';
    const initialStock = dto.stock ?? 0;

    // Determine which branch gets the initial BranchStock row.
    // Non-OWNER: always use JWT branchId (body.branchId is ignored for safety).
    // OWNER/SUPER_ADMIN: use body.branchId if provided.
    const effectiveBranchId: string | undefined = isPrivileged
      ? (dto.branchId ?? undefined)
      : (userBranchId ?? undefined);

    // Block OWNER in global mode trying to create product with stock
    if (isPrivileged && !effectiveBranchId && initialStock > 0) {
      throw new BadRequestException('กรุณาเลือกสาขาก่อนเพิ่มสต๊อกสินค้า');
    }

    // Verify branch belongs to this tenant before assigning stock
    if (effectiveBranchId) {
      await this.tenantSvc.assertBranchOwnership(tenantId, effectiveBranchId);
    }

    const existing = await this.prisma.product.findFirst({
      where: { sku: dto.sku, ...this.tenantSvc.scope(tenantId) },
    });
    if (existing) throw new ConflictException('SKU already exists');

    // Create Product master + optional BranchStock atomically
    const product = await this.prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          name:         dto.name,
          sku:          dto.sku,
          barcode:      dto.barcode,
          type:         dto.type as any,
          price:        dto.price,
          costPrice:    dto.costPrice,
          stock:        0,          // always start at 0; synced from BranchStock below
          minStock:     dto.minStock ?? 0,
          description:  dto.description,
          imageUrl:     dto.imageUrl,
          categoryId:   dto.categoryId,
          warrantyType: (dto.warrantyType as any) ?? 'NO_WARRANTY',
          warrantyDays: dto.warrantyDays ?? null,
          hasSerial:    dto.hasSerial ?? false,
          ...(tenantId ? { tenantId } : {}),
        },
        include: { category: { include: { categoryType: { select: { id: true, name: true } } } } },
      });

      if (effectiveBranchId) {
        // Single branch context: create one BranchStock row
        const stockCode = await this.generateStockCode(effectiveBranchId, tx);
        await (tx as any).branchStock.create({
          data: {
            branchId:  effectiveBranchId,
            productId: prod.id,
            quantity:  initialStock,
            minStock:  dto.minStock ?? 0,
            stockCode,
          },
        });

        if (initialStock > 0) {
          await tx.product.update({
            where: { id: prod.id },
            data:  { stock: initialStock },
          });
          (prod as any).stock = initialStock;
        }
      } else if (isPrivileged && tenantId) {
        // OWNER in global mode: seed BranchStock=0 for every active branch so the
        // product is visible (as "หมดสต็อก") in all branch POS views immediately.
        const branches = await tx.branch.findMany({
          where: { tenantId, isActive: true, status: 'ACTIVE' as any },
          select: { id: true },
        });
        for (const branch of branches) {
          const stockCode = await this.generateStockCode(branch.id, tx);
          await (tx as any).branchStock.create({
            data: {
              branchId:  branch.id,
              productId: prod.id,
              quantity:  0,
              minStock:  dto.minStock ?? 0,
              ...(stockCode ? { stockCode } : {}),
            },
          });
        }
      }

      return prod;
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'PRODUCT_CREATED',
      entityType: 'Product',
      entityId: product.id,
      afterData: {
        name: product.name, sku: product.sku, type: product.type,
        price: Number(product.price), branchId: effectiveBranchId,
      },
    });
    return product;
  }

  async findAll(query: {
    search?: string;
    type?: string;
    categoryId?: string;
    lowStock?: string;
    branchId?: string;
    role?: string;
    tenantId?: string | null;
  }) {
    const isOwner   = query.role === 'OWNER' || query.role === 'SUPER_ADMIN';
    const viewAll   = isOwner && !query.branchId;
    const branchId  = query.branchId;

    const where: any = { isActive: true, ...this.tenantSvc.scope(query.tenantId) };

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { sku: { contains: query.search, mode: 'insensitive' } },
        { barcode: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    if (query.type) where.type = query.type;
    if (query.categoryId) where.categoryId = query.categoryId;

    // Fetch base products (master data only)
    const products = await this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'desc' },
    });

    const productIds = products.map((p) => p.id);

    // ── Enrich with branch-specific stock ────────────────────────────────────
    if (viewAll) {
      // OWNER "all branches": fetch every BranchStock + branch name, compute sum + breakdown
      const allBs = await (this.prisma as any).branchStock.findMany({
        where: { productId: { in: productIds } },
        include: { branch: { select: { id: true, name: true } } },
      });

      const bsMap = new Map<string, any[]>();
      for (const bs of allBs) {
        const list = bsMap.get(bs.productId) ?? [];
        list.push(bs);
        bsMap.set(bs.productId, list);
      }

      const result = products.map((p) => {
        const bsList = bsMap.get(p.id) ?? [];
        const branchQuantity = bsList.reduce((s, bs) => s + (bs.quantity ?? 0), 0);
        const branchBreakdown = bsList
          .map((bs) => ({
            branchId:   bs.branchId,
            branchName: bs.branch?.name ?? bs.branchId,
            quantity:   bs.quantity,
            stockCode:  bs.stockCode ?? null,
            minStock:   bs.minStock,
          }))
          .sort((a, b) => a.branchName.localeCompare(b.branchName, 'th'));
        return { ...p, branchQuantity, stockCode: null, branchBreakdown };
      });

      return query.lowStock === 'true'
        ? result.filter((p) => p.branchQuantity <= p.minStock)
        : result;
    }

    if (branchId) {
      // Fetch only BranchStock records that exist for this branch (INNER JOIN semantics).
      // Products with no BranchStock row for the branch are hidden entirely.
      const bsList = await (this.prisma as any).branchStock.findMany({
        where: { branchId, productId: { in: productIds } },
      });

      const bsMap = new Map<string, any>();
      for (const bs of bsList) bsMap.set(bs.productId, bs);

      // Products WITH BranchStock record for this branch, OR with global stock > 0
      // (the latter = not yet enrolled in branch stock — shown with branchQuantity null)
      const visibleProducts = products.filter(
        (p) => bsMap.has(p.id) || Number(p.stock ?? 0) > 0,
      );
      const visibleIds = visibleProducts.map((p) => p.id);

      // Fetch other-branch totals only for enrolled products
      const enrolledIds = visibleIds.filter((id) => bsMap.has(id));
      const otherBsList = await (this.prisma as any).branchStock.findMany({
        where: { branchId: { not: branchId }, productId: { in: enrolledIds } },
        select: { productId: true, quantity: true },
      });

      const otherTotalMap = new Map<string, number>();
      for (const bs of otherBsList) {
        otherTotalMap.set(bs.productId, (otherTotalMap.get(bs.productId) ?? 0) + (bs.quantity ?? 0));
      }

      const result = visibleProducts.map((p) => {
        const bs = bsMap.get(p.id);
        if (!bs) {
          // Not enrolled in this branch — expose global stock as context for repair parts picker
          return { ...p, branchQuantity: null, stockCode: null, hasStockRecord: false, otherBranchTotal: 0 };
        }
        return {
          ...p,
          branchQuantity:   bs.quantity ?? 0,
          stockCode:        bs.stockCode ?? null,
          hasStockRecord:   true,
          otherBranchTotal: otherTotalMap.get(p.id) ?? 0,
        };
      });

      return query.lowStock === 'true'
        ? result.filter((p) => p.branchQuantity <= p.minStock)
        : result;
    }

    // No branch context — return global stock as branchQuantity (legacy fallback)
    const result = products.map((p) => ({ ...p, branchQuantity: p.stock, stockCode: null }));
    return query.lowStock === 'true'
      ? result.filter((p) => p.branchQuantity <= p.minStock)
      : result;
  }

  async findOne(id: string, branchId?: string, tenantId?: string | null) {
    const product = await this.prisma.product.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
      include: {
        category: true,
        stockMovements: { take: 10, orderBy: { createdAt: 'desc' } },
      },
    });

    if (!product) throw new NotFoundException('Product not found');

    if (branchId) {
      const bs = await (this.prisma as any).branchStock.findUnique({
        where: { branchId_productId: { branchId, productId: id } },
      });
      return {
        ...product,
        branchQuantity: bs?.quantity ?? 0,
        stockCode:      bs?.stockCode ?? null,
      };
    }

    return { ...product, branchQuantity: product.stock, stockCode: null };
  }

  async findByBarcode(barcode: string, branchId?: string, tenantId?: string | null) {
    const product = await this.prisma.product.findFirst({
      where: {
        OR: [{ barcode }, { sku: barcode }],
        isActive: true,
        ...this.tenantSvc.scope(tenantId),
      },
      include: { category: true },
    });

    if (!product) throw new NotFoundException('Product not found');

    if (branchId) {
      const bs = await (this.prisma as any).branchStock.findUnique({
        where: { branchId_productId: { branchId, productId: product.id } },
      });
      // No BranchStock record → product is not visible in this branch
      if (!bs) throw new NotFoundException('ไม่พบสินค้าในสาขานี้');
      return {
        ...product,
        branchQuantity: bs.quantity ?? 0,
        stockCode:      bs.stockCode ?? null,
        hasStockRecord: true,
      };
    }

    return { ...product, branchQuantity: product.stock, stockCode: null };
  }

  async update(id: string, dto: UpdateProductDto, actorId?: string, actorName?: string, tenantId?: string | null) {
    await this.findOne(id, undefined, tenantId);

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        type: dto.type as any,
        price: dto.price,
        costPrice: dto.costPrice,
        stock: dto.stock,
        minStock: dto.minStock,
        description: dto.description,
        imageUrl: dto.imageUrl,
        categoryId: dto.categoryId,
        warrantyType: dto.warrantyType as any,
        warrantyDays: dto.warrantyDays,
        hasSerial: dto.hasSerial,
      },
      include: { category: true },
    });
    await this.auditLog.log({
      actorId, actorName,
      action: 'PRODUCT_UPDATED',
      entityType: 'Product',
      entityId: id,
      afterData: { name: dto.name, sku: dto.sku, price: dto.price },
    });
    return product;
  }

  async remove(id: string, actorId?: string, actorName?: string, tenantId?: string | null) {
    await this.findOne(id, undefined, tenantId);
    const product = await this.prisma.product.update({
      where: { id },
      data: { isActive: false },
    });
    await this.auditLog.log({
      actorId, actorName,
      action: 'PRODUCT_DELETED',
      entityType: 'Product',
      entityId: id,
    });
    return product;
  }

  async catalogSearch(search?: string, barcode?: string, tenantId?: string | null) {
    if (!search && !barcode) return [];

    const where: any = { isActive: true, ...this.tenantSvc.scope(tenantId) };

    if (barcode) {
      where.OR = [{ barcode }, { sku: barcode }];
    } else {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search, mode: 'insensitive' } },
      ];
    }

    return this.prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: { name: 'asc' },
      take: 20,
    });
  }

  async enrollBranch(
    productId: string,
    dto: EnrollBranchDto,
    actorId?: string,
    actorName?: string,
    userBranchId?: string | null,
    userRole?: string,
    tenantId?: string,
  ) {
    const isPrivileged = userRole === 'OWNER' || userRole === 'SUPER_ADMIN';
    const effectiveBranchId: string | undefined = isPrivileged
      ? (dto.branchId ?? undefined)
      : (userBranchId ?? undefined);

    if (!effectiveBranchId) {
      throw new BadRequestException('กรุณาเลือกสาขาก่อนเพิ่มสินค้าเข้าสาขา');
    }

    // Validate product belongs to tenant
    const product = await this.prisma.product.findUnique({ where: { id: productId, ...(tenantId ? { tenantId } : {}) } });
    if (!product || !product.isActive) throw new NotFoundException('Product not found');

    // Validate branch belongs to same tenant (prevents cross-tenant stock enrollment)
    if (tenantId) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: effectiveBranchId },
        select: { tenantId: true },
      });
      if (!branch || branch.tenantId !== tenantId) {
        throw new NotFoundException('ไม่พบสาขา');
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const existing = await (tx as any).branchStock.findUnique({
        where: { branchId_productId: { branchId: effectiveBranchId, productId } },
      });

      if (existing) {
        const updated = await (tx as any).branchStock.update({
          where: { branchId_productId: { branchId: effectiveBranchId, productId } },
          data: {
            quantity: { increment: dto.quantity },
            ...(dto.minStock !== undefined ? { minStock: dto.minStock } : {}),
          },
        });
        await this.syncProductShadowStock(productId, tx);
        return updated;
      } else {
        const stockCode = await this.generateStockCode(effectiveBranchId, tx);
        const created = await (tx as any).branchStock.create({
          data: {
            branchId: effectiveBranchId,
            productId,
            quantity: dto.quantity,
            minStock: dto.minStock ?? 0,
            stockCode,
          },
        });
        await this.syncProductShadowStock(productId, tx);
        return created;
      }
    });

    await this.auditLog.log({
      actorId, actorName,
      action: 'BRANCH_STOCK_ENROLLED',
      entityType: 'BranchStock',
      entityId: productId,
      afterData: { productId, branchId: effectiveBranchId, quantity: dto.quantity },
    });

    return result;
  }

  async getAvailability(id: string, tenantId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id, tenantId },
      select: { id: true, name: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Filter by branch.tenantId so a tenant cannot see another tenant's branch stock
    const stocks = await (this.prisma as any).branchStock.findMany({
      where: { productId: id, branch: { tenantId } },
      include: { branch: { select: { id: true, name: true } } },
      orderBy: { quantity: 'desc' },
    });

    return {
      productId: id,
      branches: stocks.map((bs: any) => ({
        branchId:   bs.branchId,
        branchName: bs.branch?.name ?? bs.branchId,
        quantity:   bs.quantity ?? 0,
        stockCode:  bs.stockCode ?? null,
      })),
    };
  }
}
