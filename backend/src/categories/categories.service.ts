import {
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

  async createType(dto: CreateCategoryTypeDto) {
    const slug = dto.slug?.trim() || this.toSlug(dto.name) || `type-${Date.now()}`;
    const existing = await this.prisma.categoryType.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Slug already exists');
    return this.prisma.categoryType.create({ data: { name: dto.name, slug } });
  }

  async findAllTypes(tenantId?: string | null) {
    const tenantWhere = this.tenantSvc.scope(tenantId);
    return this.prisma.categoryType.findMany({
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
  }

  async updateType(id: string, dto: Partial<CreateCategoryTypeDto>) {
    const type = await this.prisma.categoryType.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('CategoryType not found');
    return this.prisma.categoryType.update({ where: { id }, data: { name: dto.name } });
  }

  async removeType(id: string) {
    const type = await this.prisma.categoryType.findUnique({
      where: { id },
      include: { _count: { select: { categories: true } } },
    });
    if (!type) throw new NotFoundException('CategoryType not found');
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

    if (dto.categoryTypeId) {
      const type = await this.prisma.categoryType.findUnique({ where: { id: dto.categoryTypeId } });
      if (!type) throw new NotFoundException('CategoryType not found');
    }

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
      const type = await this.prisma.categoryType.findUnique({ where: { id: dto.categoryTypeId } });
      if (!type) throw new NotFoundException('CategoryType not found');
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
