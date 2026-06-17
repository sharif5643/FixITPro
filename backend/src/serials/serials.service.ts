import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateSerialDto } from './dto/create-serial.dto';
import { CreateBulkSerialDto } from './dto/create-bulk-serial.dto';
import { UpdateSerialDto } from './dto/update-serial.dto';

const SERIAL_INCLUDE = {
  product: { select: { id: true, name: true, sku: true, warrantyType: true, warrantyDays: true } },
  saleItem: {
    select: {
      id: true,
      sale: { select: { receiptNumber: true, createdAt: true } },
    },
  },
} as const;

@Injectable()
export class SerialsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateSerialDto, tenantId?: string | null) {
    const productWhere: any = { id: dto.productId };
    if (tenantId) productWhere.tenantId = tenantId;
    const product = await this.prisma.product.findFirst({ where: productWhere });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.hasSerial) throw new BadRequestException('Product does not track serials');

    const exists = await this.prisma.serialNumber.findUnique({ where: { serial: dto.serial } });
    if (exists) throw new ConflictException(`Serial "${dto.serial}" already registered`);

    return this.prisma.serialNumber.create({
      data: {
        serial: dto.serial,
        productId: dto.productId,
        note: dto.note,
        purchaseOrderItemId: dto.purchaseOrderItemId,
      },
      include: SERIAL_INCLUDE,
    });
  }

  async createBulk(dto: CreateBulkSerialDto, tenantId?: string | null) {
    const productWhere: any = { id: dto.productId };
    if (tenantId) productWhere.tenantId = tenantId;
    const product = await this.prisma.product.findFirst({ where: productWhere });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.hasSerial) throw new BadRequestException('Product does not track serials');

    const duplicates = await this.prisma.serialNumber.findMany({
      where: { serial: { in: dto.serials } },
      select: { serial: true },
    });
    if (duplicates.length > 0) {
      throw new ConflictException(
        `Already registered: ${duplicates.map((d) => d.serial).join(', ')}`,
      );
    }

    await this.prisma.serialNumber.createMany({
      data: dto.serials.map((serial) => ({
        serial,
        productId: dto.productId,
        note: dto.note,
        purchaseOrderItemId: dto.purchaseOrderItemId,
      })),
    });

    return this.prisma.serialNumber.findMany({
      where: { serial: { in: dto.serials } },
      include: SERIAL_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAll(query: {
    productId?: string;
    status?: string;
    search?: string;
    limit?: string;
    page?: string;
  }, tenantId?: string | null) {
    const where: any = {};
    if (query.productId) where.productId = query.productId;
    if (query.status)    where.status    = query.status;
    if (query.search)    where.serial    = { contains: query.search, mode: 'insensitive' };
    if (tenantId)        where.product   = { tenantId };

    const limit = Math.min(parseInt(query.limit ?? '50', 10), 200);
    const page = Math.max(parseInt(query.page ?? '1', 10), 1);

    const [total, items] = await Promise.all([
      this.prisma.serialNumber.count({ where }),
      this.prisma.serialNumber.findMany({
        where,
        include: SERIAL_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
    ]);

    return { total, page, limit, items };
  }

  async findOne(id: string, tenantId?: string | null) {
    const where: any = { id };
    if (tenantId) where.product = { tenantId };
    const s = await this.prisma.serialNumber.findFirst({
      where,
      include: SERIAL_INCLUDE,
    });
    if (!s) throw new NotFoundException('Serial not found');
    return s;
  }

  async lookup(serial: string, tenantId?: string | null) {
    const where: any = { serial };
    if (tenantId) where.product = { tenantId };
    const s = await this.prisma.serialNumber.findFirst({
      where,
      include: SERIAL_INCLUDE,
    });
    if (!s) throw new NotFoundException(`Serial "${serial}" not found`);
    return s;
  }

  async update(id: string, dto: UpdateSerialDto, tenantId?: string | null) {
    await this.findOne(id, tenantId);
    return this.prisma.serialNumber.update({
      where: { id },
      data: { status: dto.status as any, note: dto.note },
      include: SERIAL_INCLUDE,
    });
  }
}
