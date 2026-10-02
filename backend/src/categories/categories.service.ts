import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { TenantService } from '../tenant/tenant.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryTypeDto } from './dto/create-category-type.dto';

@Injectable()
export class CategoriesService {
  constructor(
    private prisma: PrismaService,
    private tenantSvc: TenantService,
  ) {}

  private toSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^฀-๿a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ── Category Types ────────────────────────────────────────────────

  // Types a tenant can see: shared ones (tenantId NULL) plus its own.
  // Users without a tenant (SUPER_ADMIN) see every type.
  private visibleTypesWhere(tenantId?: string | null) {
    return tenantId ? { OR: [{ tenantId: null }, { tenantId }] } : {};
  }

  // Shops may only change their own types; shared types are managed by SUPER_ADMIN.
  private async getEditableType(id: string, tenantId: string | null | undefined, role: string | undefined) {
    const type = await this.prisma.categoryType.findFirst({
      where:   { id, ...this.visibleTypesWhere(tenantId) },
      include: { _count: { select: { categories: true } } },
    });
    if (!type) throw new NotFoundException('CategoryType not found');
    if (role !== 'SUPER_ADMIN' && type.tenantId !== (tenantId ?? null)) {
      throw new ForbiddenException('ประเภทนี้เป็นประเภทกลางของระบบ แก้ไขหรือลบไม่ได้');
    }
    return type;
  }

  async assertTypeVisible(categoryTypeId: string, tenantId?: string | null) {
    const type = await this.prisma.categoryType.findFirst({
      where: { id: categoryTypeId, ...this.visibleTypesWhere(tenantId) },
    });
    if (!type) throw new NotFoundException('CategoryType not found');
  }

  async createType(dto: CreateCategoryTypeDto, tenantId: string | null) {
    const slug = dto.slug?.trim() || this.toSlug(dto.name) || `type-${Date.now()}`;
    const existing = await this.prisma.categoryType.findFirst({ where: { slug, tenantId: tenantId ?? null } });
    if (existing) throw new ConflictException('Slug already exists');
    return this.prisma.categoryType.create({ data: { name: dto.name, slug, tenantId: tenantId ?? null } });
  }

  async findAllTypes(tenantId?: string | null) {
    const tenantWhere = this.tenantSvc.scope(tenantId);
    const types = await this.prisma.categoryType.findMany({
      where: this.visibleTypesWhere(tenantId),
      include: {
        categories: {
          where: tenantWhere,
          include: { _count: { select: { products: true } } },
          orderBy: { name: 'asc' },
        },
        _count: { select: { categories: { where: tenantWhere } } },
      },
      orderBy: { name: 'asc' },
    });

    // Get in-stock counts (stock > 0 AND isActive) per category in one query
    const catIds = types.flatMap((t) => t.categories.map((c) => c.id));
    const inStockRows = catIds.length
      ? await this.prisma.product.groupBy({
          by: ['categoryId'],
          where: { categoryId: { in: catIds }, stock: { gt: 0 }, isActive: true },
          _count: { id: true },
        })
      : [];
    const inStockMap = new Map(inStockRows.map((r) => [r.categoryId, r._count.id]));

    return types.map((type) => ({
      ...type,
      categories: type.categories.map((cat) => ({
        ...cat,
        inStockCount: inStockMap.get(cat.id) ?? 0,
      })),
    }));
  }

  async updateType(id: string, dto: Partial<CreateCategoryTypeDto>, tenantId: string | null, role?: string) {
    await this.getEditableType(id, tenantId, role);
    return this.prisma.categoryType.update({ where: { id }, data: { name: dto.name } });
  }

  async removeType(id: string, tenantId: string | null, role?: string) {
    const type = await this.getEditableType(id, tenantId, role);
    if (type._count.categories > 0)
      throw new BadRequestException('ไม่สามารถลบประเภทที่มีหมวดหมู่อยู่ได้');
    return this.prisma.categoryType.delete({ where: { id } });
  }

  // ── Categories ────────────────────────────────────────────────────

  async create(dto: CreateCategoryDto, tenantId?: string | null) {
    const slug = dto.slug?.trim() || this.toSlug(dto.name) || `cat-${Date.now()}`;
    const existing = await this.prisma.category.findFirst({
      where: { slug, ...this.tenantSvc.scope(tenantId) },
    });
    if (existing) throw new ConflictException('Slug already exists');

    if (dto.categoryTypeId) await this.assertTypeVisible(dto.categoryTypeId, tenantId);

    return this.prisma.category.create({
      data: { name: dto.name, slug, categoryTypeId: dto.categoryTypeId, ...this.tenantSvc.scope(tenantId) },
      include: { categoryType: { select: { id: true, name: true } }, _count: { select: { products: true } } },
    });
  }

  async findAll(tenantId?: string | null, categoryTypeId?: string) {
    const where: any = { ...this.tenantSvc.scope(tenantId) };
    if (categoryTypeId) where.categoryTypeId = categoryTypeId;
    return this.prisma.category.findMany({
      where,
      include: {
        categoryType: { select: { id: true, name: true } },
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: Partial<CreateCategoryDto>, tenantId?: string | null) {
    const category = await this.prisma.category.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
    });
    if (!category) throw new NotFoundException('Category not found');

    if (dto.categoryTypeId !== undefined && dto.categoryTypeId !== null) {
      await this.assertTypeVisible(dto.categoryTypeId, tenantId);
    }

    return this.prisma.category.update({
      where: { id },
      data: {
        name: dto.name,
        categoryTypeId: dto.categoryTypeId,
      },
      include: { categoryType: { select: { id: true, name: true } }, _count: { select: { products: true } } },
    });
  }

  async remove(id: string, tenantId?: string | null) {
    const category = await this.prisma.category.findFirst({
      where: { id, ...this.tenantSvc.scope(tenantId) },
    });
    if (!category) throw new NotFoundException('Category not found');
    return this.prisma.category.delete({ where: { id } });
  }
}
