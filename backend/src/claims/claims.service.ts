import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateClaimDto } from './dto/create-claim.dto';
import { UpdateClaimStatusDto } from './dto/update-claim-status.dto';
import { UpdateClaimDto } from './dto/update-claim.dto';

// ─── Includes ──────────────────────────────────────────────────────────────────

const SERIAL_DETAIL = {
  product: {
    select: {
      id: true, name: true, sku: true,
      warrantyType: true, warrantyDays: true,
    },
  },
  saleItem: {
    include: {
      sale: { select: { id: true, receiptNumber: true, createdAt: true } },
    },
  },
} as const;

const CLAIM_LIST_INCLUDE = {
  serialNumber: {
    select: {
      id: true, serial: true, status: true, warrantyExpiresAt: true, soldAt: true,
      product: { select: { id: true, name: true, sku: true } },
    },
  },
  customer: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
  _count: { select: { history: true } },
} as const;

const CLAIM_DETAIL_INCLUDE = {
  serialNumber: { include: SERIAL_DETAIL },
  replacementSerial: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
    },
  },
  customer: { select: { id: true, name: true, phone: true, email: true } },
  createdBy: { select: { id: true, name: true } },
  history: {
    include: { createdBy: { select: { id: true, name: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
} as const;

// Statuses where claim processing is terminal
const TERMINAL_STATUSES = ['CLOSED', 'CANCELLED'];

@Injectable()
export class ClaimsService {
  constructor(private prisma: PrismaService) {}

  // ─── Claim number ────────────────────────────────────────────────────────────

  private async generateClaimNumber(): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const prefix = `CLM-${dateStr}-`;
    const last = await this.prisma.claim.findFirst({
      where: { claimNumber: { startsWith: prefix } },
      orderBy: { claimNumber: 'desc' },
    });
    const lastNum = last ? parseInt(last.claimNumber.replace(prefix, ''), 10) : 0;
    return `${prefix}${String(lastNum + 1).padStart(4, '0')}`;
  }

  // ─── Create ──────────────────────────────────────────────────────────────────

  async create(dto: CreateClaimDto, userId: string) {
    const serial = await this.prisma.serialNumber.findUnique({
      where: { id: dto.serialNumberId },
      include: {
        saleItem: { include: { sale: { select: { customerId: true } } } },
      },
    });
    if (!serial) throw new NotFoundException('ไม่พบ Serial');
    if (serial.status !== 'SOLD') {
      throw new BadRequestException(
        `Serial "${serial.serial}" ไม่อยู่ในสถานะที่เคลมได้ (สถานะปัจจุบัน: ${serial.status})`,
      );
    }

    const customerId = serial.saleItem?.sale?.customerId ?? null;
    const claimNumber = await this.generateClaimNumber();

    return this.prisma.$transaction(async (tx) => {
      const claim = await tx.claim.create({
        data: {
          claimNumber,
          claimType: dto.claimType as any,
          status: 'OPEN',
          symptom: dto.symptom,
          note: dto.note,
          serialNumberId: dto.serialNumberId,
          customerId,
          createdById: userId,
        },
      });

      await tx.claimStatusHistory.create({
        data: {
          claimId: claim.id,
          status: 'OPEN',
          note: `เปิดเคลม: ${dto.symptom}`,
          createdById: userId,
        },
      });

      await tx.serialNumber.update({
        where: { id: dto.serialNumberId },
        data: { status: 'CLAIMED' },
      });

      return this.findOne(claim.id);
    });
  }

  // ─── Find all ────────────────────────────────────────────────────────────────

  async findAll(query: {
    status?: string;
    claimType?: string;
    search?: string;
    page?: string;
    limit?: string;
  }) {
    const where: any = {};

    if (query.status) where.status = query.status;
    if (query.claimType) where.claimType = query.claimType;
    if (query.search) {
      where.OR = [
        { claimNumber: { contains: query.search, mode: 'insensitive' } },
        { serialNumber: { serial: { contains: query.search, mode: 'insensitive' } } },
        { customer: { name: { contains: query.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: query.search, mode: 'insensitive' } } },
      ];
    }

    const limit = Math.min(parseInt(query.limit ?? '50', 10), 200);
    const page = Math.max(parseInt(query.page ?? '1', 10), 1);

    const [total, items] = await Promise.all([
      this.prisma.claim.count({ where }),
      this.prisma.claim.findMany({
        where,
        include: CLAIM_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit,
      }),
    ]);

    return { total, page, limit, items };
  }

  // ─── Find one ────────────────────────────────────────────────────────────────

  async findOne(id: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: CLAIM_DETAIL_INCLUDE,
    });
    if (!claim) throw new NotFoundException('ไม่พบเคลม');
    return claim;
  }

  // ─── Update status ───────────────────────────────────────────────────────────

  async updateStatus(claimId: string, dto: UpdateClaimStatusDto, userId: string) {
    const claim = await this.findOne(claimId);

    if (TERMINAL_STATUSES.includes(claim.status)) {
      throw new BadRequestException(`ไม่สามารถเปลี่ยนสถานะจาก ${claim.status} ได้`);
    }

    if (dto.status === 'REPLACED' && !dto.replacementSerialId) {
      throw new BadRequestException('ต้องระบุ Serial สินค้าทดแทนเมื่อเปลี่ยนสถานะเป็น REPLACED');
    }

    return this.prisma.$transaction(async (tx) => {
      // ── Serial status transitions ──────────────────────────────────────────
      if (dto.status === 'CANCELLED') {
        // Restore original serial to SOLD
        await tx.serialNumber.update({
          where: { id: claim.serialNumberId },
          data: { status: 'SOLD' },
        });
        // Return any previously assigned replacement serial to IN_STOCK
        if (claim.replacementSerialId) {
          await tx.serialNumber.update({
            where: { id: claim.replacementSerialId },
            data: { status: 'IN_STOCK', saleItemId: null, soldAt: null, warrantyExpiresAt: null },
          });
        }
      } else if (dto.status === 'REPLACED') {
        const repSerial = await tx.serialNumber.findUnique({
          where: { id: dto.replacementSerialId },
        });
        if (!repSerial) throw new NotFoundException('ไม่พบ Serial ทดแทน');
        if (repSerial.status !== 'IN_STOCK') {
          throw new BadRequestException(`Serial "${repSerial.serial}" ไม่พร้อมใช้งาน (${repSerial.status})`);
        }
        if (repSerial.productId !== claim.serialNumber.productId) {
          throw new BadRequestException('สินค้าทดแทนต้องเป็นรุ่นเดียวกับสินค้าที่เคลม');
        }

        const product = claim.serialNumber.product;
        const soldAt = new Date();
        const warrantyExpiresAt =
          product.warrantyDays
            ? new Date(soldAt.getTime() + product.warrantyDays * 24 * 60 * 60 * 1000)
            : null;

        await tx.serialNumber.update({
          where: { id: dto.replacementSerialId },
          data: {
            status: 'SOLD',
            soldAt,
            warrantyExpiresAt,
            saleItemId: claim.serialNumber.saleItemId ?? null,
          },
        });
      } else if (dto.status === 'RETURNED') {
        await tx.serialNumber.update({
          where: { id: claim.serialNumberId },
          data: {
            status: 'RETURNED',
            saleItemId: null,
            soldAt: null,
            warrantyExpiresAt: null,
          },
        });
      }

      // ── Update claim ─────────────────────────────────────────────────────
      await tx.claim.update({
        where: { id: claimId },
        data: {
          status: dto.status as any,
          ...(dto.claimCost !== undefined && { claimCost: dto.claimCost }),
          ...(dto.note !== undefined && { note: dto.note }),
          ...(dto.replacementSerialId && { replacementSerialId: dto.replacementSerialId }),
        },
      });

      // ── History entry ─────────────────────────────────────────────────────
      await tx.claimStatusHistory.create({
        data: {
          claimId,
          status: dto.status as any,
          note: dto.note,
          createdById: userId,
        },
      });

      return this.findOne(claimId);
    });
  }

  // ─── Update cost / note ───────────────────────────────────────────────────────

  async update(claimId: string, dto: UpdateClaimDto) {
    await this.findOne(claimId);
    return this.prisma.claim.update({
      where: { id: claimId },
      data: {
        ...(dto.claimCost !== undefined && { claimCost: dto.claimCost }),
        ...(dto.note !== undefined && { note: dto.note }),
      },
      include: CLAIM_DETAIL_INCLUDE,
    });
  }

  // ─── Stats ───────────────────────────────────────────────────────────────────

  async getStats() {
    const [byStatus, totalCost, pendingCost] = await Promise.all([
      this.prisma.claim.groupBy({
        by: ['status'],
        _count: { id: true },
      }),
      this.prisma.claim.aggregate({
        _sum: { claimCost: true },
        where: { status: { not: 'CANCELLED' } },
      }),
      this.prisma.claim.aggregate({
        _sum: { claimCost: true },
        where: { status: { notIn: ['CLOSED', 'CANCELLED', 'REJECTED'] } },
      }),
    ]);

    const statusMap = byStatus.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row._count.id;
      return acc;
    }, {});

    return {
      byStatus: statusMap,
      totalClaimCost: Number(totalCost._sum.claimCost ?? 0),
      pendingClaimCost: Number(pendingCost._sum.claimCost ?? 0),
    };
  }
}
