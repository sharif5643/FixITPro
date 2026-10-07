import { randomInt } from 'crypto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../database/prisma.service';
import { PlanLimitsService, PLAN_LIMITS } from '../../plan-limits/plan-limits.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { ActivateTenantDto } from './dto/activate-tenant.dto';
import { RenewTenantDto } from './dto/renew-tenant.dto';
import { TenantPlan } from '@prisma/client';
import { ModulesService } from '../../modules/modules.service';

const DAY_MS = 86_400_000;

@Injectable()
export class TenantsService {
  constructor(
    private prisma: PrismaService,
    private planLimits: PlanLimitsService,
    private modules: ModulesService,
  ) {}

  async findAll(filter?: string) {
    const now = new Date();
    const sevenDaysLater = new Date(Date.now() + 7 * DAY_MS);

    // Removed trial shops are listed only under their own filter
    let where: Record<string, any> = { status: { not: 'DELETED' } };
    switch (filter) {
      case 'deleted':
        where = { status: 'DELETED' };
        break;
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

    const result = await this.prisma.$transaction(async (tx) => {
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
    await this.modules.invalidateCache(id); // plan may have changed
    return result;
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
    if (!PLAN_LIMITS[newPlan]) throw new BadRequestException(`แผน ${newPlan} ไม่รองรับ`);

    // Phase 18: Downgrade safety — verify current branch count fits new plan limit
    if (newPlan !== tenant.plan) {
      const newLimit = PLAN_LIMITS[newPlan].branches;
      if (isFinite(newLimit)) {
        const currentBranches = await this.prisma.branch.count({
          where: { tenantId: id, status: { notIn: ['SUSPENDED', 'REJECTED'] } },
        });
        if (currentBranches > newLimit) {
          throw new BadRequestException(
            `ไม่สามารถลดแผนเป็น ${newPlan} ได้ — ปัจจุบันมี ${currentBranches} สาขา แต่แผนใหม่รองรับสูงสุด ${newLimit} สาขา กรุณาลดจำนวนสาขาก่อน`,
          );
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
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
    await this.modules.invalidateCache(id); // plan may have changed
    return result;
  }

  async suspend(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    return this.prisma.tenant.update({ where: { id }, data: { status: 'SUSPENDED' } });
  }

  async reactivate(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    if (tenant.status === 'DELETED') throw new BadRequestException('ร้านนี้ถูกลบแล้ว — ใช้ "กู้คืนร้าน" แทน');
    return this.prisma.tenant.update({ where: { id }, data: { status: 'ACTIVE' } });
  }

  // ── Removing a trial shop ───────────────────────────────────────────────────
  // Only a shop that never really worked (no sales, no repair jobs) can be removed. Its records
  // stay; it is hidden from the lists, its people cannot log in, and its emails are freed so the
  // person can sign up again. The original emails are kept in the activity log for "restore".

  /** What the shop has, and whether it may be removed. */
  async deleteCheck(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, select: { id: true, shopName: true, status: true, plan: true } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    const branch = { branch: { tenantId: id } };
    const [sales, repairs, products, customers, users] = await Promise.all([
      this.prisma.sale.count({ where: branch }),
      this.prisma.repair.count({ where: branch }),
      this.prisma.product.count({ where: { tenantId: id } }),
      this.prisma.customer.count({ where: { tenantId: id } }),
      this.prisma.user.count({ where: { tenantId: id } }),
    ]);
    const reasons: string[] = [];
    if (tenant.status === 'DELETED') reasons.push('ร้านนี้ถูกลบไปแล้ว');
    // A shop on a paid plan is a customer, never a trial to clean up
    if (tenant.plan !== 'TRIAL' && tenant.status !== 'PENDING') reasons.push(`เป็นร้านแพ็กเกจ ${tenant.plan} (ไม่ใช่ร้านทดลอง)`);
    if (sales > 0) reasons.push(`มีบิลขาย ${sales} บิล`);
    if (repairs > 0) reasons.push(`มีงานซ่อม ${repairs} งาน`);
    return { shopName: tenant.shopName, sales, repairs, products, customers, users, canDelete: reasons.length === 0, reasons };
  }

  async deleteTrialShop(id: string, confirmName: string, admin: { id?: string; name?: string }) {
    const check = await this.deleteCheck(id);
    if (!check.canDelete) {
      throw new BadRequestException(`ลบไม่ได้: ${check.reasons.join(', ')} — ใช้ "ระงับร้าน" แทน`);
    }
    if ((confirmName ?? '').trim() !== check.shopName.trim()) {
      throw new BadRequestException('ชื่อร้านที่พิมพ์ไม่ตรง');
    }
    const tenant = await this.prisma.tenant.findUniqueOrThrow({ where: { id } });
    const users = await this.prisma.user.findMany({ where: { tenantId: id }, select: { id: true, email: true, isActive: true } });
    const tag = `deleted-${Date.now()}`;
    const freed = (email: string) => `${tag}.${email}`;

    await this.prisma.$transaction(async (tx) => {
      await tx.auditLog.create({
        data: {
          actorId: admin.id ?? null, actorName: admin.name ?? null,
          action: 'TENANT_DELETED', entityType: 'Tenant', entityId: id,
          beforeData: { status: tenant.status, email: tenant.email, users } as any,
          afterData: { shopName: tenant.shopName, tag } as any,
        },
      });
      for (const u of users) {
        await tx.user.update({ where: { id: u.id }, data: { isActive: false, email: freed(u.email) } });
      }
      await tx.tenant.update({ where: { id }, data: { status: 'DELETED', email: freed(tenant.email) } });
    });
    return { deleted: true, shopName: tenant.shopName };
  }

  /** Bring a removed shop back (suspended, so the system admin decides when it opens again). */
  async restoreDeleted(id: string, admin: { id?: string; name?: string }) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant || tenant.status !== 'DELETED') throw new NotFoundException('ไม่พบร้านที่ถูกลบ');
    const log = await this.prisma.auditLog.findFirst({
      where: { action: 'TENANT_DELETED', entityId: id }, orderBy: { createdAt: 'desc' },
    });
    const before = (log?.beforeData ?? {}) as { email?: string; users?: { id: string; email: string; isActive: boolean }[] };
    if (!before.email) throw new BadRequestException('ไม่พบข้อมูลก่อนลบ — กู้คืนอัตโนมัติไม่ได้');

    // Someone may have signed up again with the same email since
    const emails = [before.email, ...(before.users ?? []).map((u) => u.email)];
    const [tenantTaken, userTaken] = await Promise.all([
      this.prisma.tenant.findFirst({ where: { email: before.email, id: { not: id } }, select: { id: true } }),
      this.prisma.user.findFirst({ where: { email: { in: emails }, tenantId: { not: id } }, select: { email: true } }),
    ]);
    if (tenantTaken || userTaken) {
      throw new ConflictException(`กู้คืนไม่ได้: อีเมล ${userTaken?.email ?? before.email} ถูกใช้สมัครใหม่แล้ว`);
    }
    await this.prisma.$transaction(async (tx) => {
      for (const u of before.users ?? []) {
        await tx.user.updateMany({ where: { id: u.id, tenantId: id }, data: { email: u.email, isActive: u.isActive } });
      }
      await tx.tenant.update({ where: { id }, data: { status: 'SUSPENDED', email: before.email! } });
      await tx.auditLog.create({
        data: { actorId: admin.id ?? null, actorName: admin.name ?? null, action: 'TENANT_RESTORED', entityType: 'Tenant', entityId: id, afterData: { status: 'SUSPENDED' } },
      });
    });
    return { restored: true, status: 'SUSPENDED' };
  }

  async resetOwnerPassword(tenantId: string, adminId: string) {
    const owner = await this.prisma.user.findFirst({
      where: { tenantId, role: 'OWNER' },
      select: { id: true, name: true },
    });
    if (!owner) throw new NotFoundException('ไม่พบเจ้าของร้านในระบบ');

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = 'Tmp';
    for (let i = 0; i < 10; i++) {
      tempPassword += chars.charAt(randomInt(chars.length));
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
    if (!PLAN_LIMITS[plan]) throw new BadRequestException(`แผน ${plan} ไม่รองรับ`);
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('ไม่พบข้อมูลร้าน');
    const updated = await this.prisma.tenant.update({ where: { id }, data: { plan } });
    await this.modules.invalidateCache(id);
    return updated;
  }

  async stats() {
    const now = new Date();
    const sevenDaysLater = new Date(Date.now() + 7 * DAY_MS);

    const [total, active, expiring, expired, suspended, pending] = await Promise.all([
      this.prisma.tenant.count({ where: { status: { not: 'DELETED' } } }),
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
