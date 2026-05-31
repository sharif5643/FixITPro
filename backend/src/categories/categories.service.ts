import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryTypeDto } from './dto/create-category-type.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

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

  async findAllTypes() {
    return this.prisma.categoryType.findMany({
      include: {
        categories: {
          include: { _count: { select: { products: true } } },
          orderBy: { name: 'asc' },
        },
        _count: { select: { categories: true } },
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

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug?.trim() || this.toSlug(dto.name) || `cat-${Date.now()}`;
    const existing = await this.prisma.category.findUnique({ where: { slug } });
    if (existing) throw new ConflictException('Slug already exists');

    if (dto.categoryTypeId) {
      const type = await this.prisma.categoryType.findUnique({ where: { id: dto.categoryTypeId } });
      if (!type) throw new NotFoundException('CategoryType not found');
    }

    return this.prisma.category.create({
      data: { name: dto.name, slug, categoryTypeId: dto.categoryTypeId },
      include: { categoryType: { select: { id: true, name: true } }, _count: { select: { products: true } } },
    });
  }

  async findAll() {
    return this.prisma.category.findMany({
      include: {
        categoryType: { select: { id: true, name: true } },
        _count: { select: { products: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async update(id: string, dto: Partial<CreateCategoryDto>) {
    const category = await this.prisma.category.findUnique({ where: { id } });
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

  async remove(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    return this.prisma.category.delete({ where: { id } });
  }
}
