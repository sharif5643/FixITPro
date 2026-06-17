import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ActivateTenantDto } from './dto/activate-tenant.dto';
import { RenewTenantDto } from './dto/renew-tenant.dto';
import { TenantPlan } from '@prisma/client';

const DAY_MS = 86_400_000;

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async findAll(filter?: string) {
    const now = new Date();
    const sevenDaysLater = new Date(Date.now() + 7 * DAY_MS);

    let where: Record<string, any> = {};
    switch (filter) {
      case 'expiring_soon':
        where = { expiryDate: { gte: now, lte: sevenDaysLater }, status: 'ACTIVE' };
        break;
      case 'expired':
        where = { status: 'EXPIRED' };
        break;
      case 'suspended':
        where = { status: 'SUSPENDED' };
        break;
      case 'pending':
        where = { status: 'PENDING' };
        break;
    }

    const [tenants, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        include: {
          _count: { select: { users: true } },
          renewals: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);

    // Auto-sync EXPIRED status for tenants whose expiryDate passed
    const expiredIds = tenants
      .filter((t) => t.status === 'ACTIVE' && t.expiryDate && t.expiryDate < now)
      .map((t) => t.id);

    if (expiredIds.length > 0) {
      await this.prisma.tenant.updateMany({
        where: { id: { in: expiredIds } },
        data: { status: 'EXPIRED' },
      });
      // Update in-memory result too
      tenants.forEach((t) => {
        if (expiredIds.includes(t.id)) (t as any).status = 'EXPIRED';
      });
    }

    return { data: tenants, total };
  }

  async findOne(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        _count: { select: { users: true } },
        renewals: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    return tenant;
  }

  async create(dto: CreateTenantDto) {
    const [existingTenant, existingUser] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { email: dto.email } }),
      this.prisma.user.findUnique({ where: { email: dto.email } }),
    ]);
    if (existingTenant || existingUser) {
      throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
    }

    const hashedPassword = await bcrypt.hash(dto.ownerPassword, 12);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          shopName: dto.shopName,
          ownerName: dto.ownerName,
          phone: dto.phone,
          email: dto.email,
          notes: dto.notes,
        },
      });

      const branch = await tx.branch.create({
        data: {
          name: 'สาขาหลัก',
          isDefault: true,
          isActive: true,
          status: 'ACTIVE',
          tenantId: tenant.id,
        },
      });

      await tx.user.create({
        data: {
          email: dto.email,
          name: dto.ownerName,
          phone: dto.phone,
          password: hashedPassword,
          role: 'OWNER',
          tenantId: tenant.id,
          branchId: branch.id,
        },
      });

      await tx.shopSettings.create({
        data: {
          shopName: dto.shopName,
          tenantId: tenant.id,
        },
      });

      return tenant;
    });
  }

  async activate(id: string, dto: ActivateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');

    if (!dto.duration && !dto.customExpiryDate) {
      throw new BadRequestException('ต้องระบุ duration หรือ customExpiryDate');
    }

    const startDate = new Date();
    const expiryDate = dto.customExpiryDate
      ? new Date(dto.customExpiryDate)
      : new Date(Date.now() + (dto.duration ?? 30) * DAY_MS);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id },
        data: { status: 'ACTIVE', plan: dto.plan, startDate, expiryDate },
      });

      await tx.tenantRenewal.create({
        data: {
          tenantId: id,
          action: 'ACTIVATE',
          plan: dto.plan,
          duration: dto.duration ?? 0,
          expiryDate,
          note: dto.note,
        },
      });

      return updated;
    });
  }

  async renew(id: string, dto: RenewTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');

    if (!dto.duration && !dto.customExpiryDate) {
      throw new BadRequestException('ต้องระบุ duration หรือ customExpiryDate');
    }

    const now = new Date();
    let newExpiryDate: Date;
    if (dto.customExpiryDate) {
      newExpiryDate = new Date(dto.customExpiryDate);
    } else {
      const base = tenant.expiryDate && tenant.expiryDate > now ? tenant.expiryDate : now;
      newExpiryDate = new Date(base.getTime() + (dto.duration ?? 30) * DAY_MS);
    }

    const newPlan: TenantPlan = dto.plan ?? tenant.plan;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tenant.update({
        where: { id },
        data: { status: 'ACTIVE', plan: newPlan, expiryDate: newExpiryDate },
      });

      await tx.tenantRenewal.create({
        data: {
          tenantId: id,
          action: 'RENEW',
          plan: newPlan,
          duration: dto.duration ?? 0,
          expiryDate: newExpiryDate,
          note: dto.note,
        },
      });

      return updated;
    });
  }

  async suspend(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    return this.prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
  }

  async reactivate(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    return this.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  async resetOwnerPassword(tenantId: string, adminId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'OWNER' },
      select: { id: true, name: true },
    });
    if (!owner) throw new NotFoundException('ไม่พบเจ้าของร้านในระบบ');

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = 'Tmp';
    for (let i = 0; i < 8; i++) {
      tempPassword += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    const hashed = await bcrypt.hash(tempPassword, 12);
    await this.prisma.user.update({
      where: { id: owner.id },
      data: {
        password: hashed,
        forcePasswordChange: true,
        passwordResetAt: new Date(),
        passwordResetById: adminId,
      },
    });

    return { tempPassword, userName: owner.name };
  }

  async changePlan(id: string, plan: TenantPlan) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    return this.prisma.tenant.update({ where: { id }, data: { plan } });
  }

  async stats() {
    const now = new Date();
    const sevenDaysLater = new Date(Date.now() + 7 * DAY_MS);

    const [total, active, expiring, expired, suspended, pending] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      this.prisma.tenant.count({
        where: { expiryDate: { gte: now, lte: sevenDaysLater }, status: 'ACTIVE' },
      }),
      this.prisma.tenant.count({ where: { status: 'EXPIRED' } }),
      this.prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      this.prisma.tenant.count({ where: { status: 'PENDING' } }),
    ]);

    return { total, active, expiring, expired, suspended, pending };
  }
}
