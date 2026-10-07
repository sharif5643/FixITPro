import { randomInt } from 'crypto';
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';

const ROLES_REQUIRING_BRANCH = ['MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF'];

const USER_SELECT = {
  id:                   true,
  email:                true,
  username:             true,
  name:                 true,
  phone:                true,
  role:                 true,
  isActive:             true,
  tenantId:             true,
  branchId:             true,
  branch:               { select: { id: true, name: true } },
  lastLoginAt:          true,
  forcePasswordChange:  true,
  lastPasswordChangedAt: true,
  createdAt:            true,
  updatedAt:            true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma:   PrismaService,
    private auditLog: AuditLogService,
    private notif:    NotificationsService,
  ) {}

  async findAll(tenantId: string | null) {
    return this.prisma.user.findMany({
      select:  USER_SELECT,
      where:   { tenantId, role: { not: 'SUPER_ADMIN' as any } },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId?: string | null) {
    const user = await this.prisma.user.findFirst({
      where:  { id, ...(tenantId ? { tenantId } : {}) },
      select: USER_SELECT,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /**
   * A MANAGER manages staff below them: they may not hand out OWNER/MANAGER roles (that let a
   * manager promote themselves to OWNER) or act on another MANAGER / OWNER account.
   * An OWNER may not demote themselves, which could leave the shop without an owner.
   */
  private assertRoleChangeAllowed(
    requesterRole: string | undefined,
    requesterId: string,
    target: { id: string; role: string } | null,
    newRole?: string,
  ) {
    if (requesterRole === 'MANAGER') {
      if (newRole && newRole !== target?.role && ['OWNER', 'MANAGER'].includes(newRole)) {
        throw new ForbiddenException('ผู้จัดการไม่สามารถกำหนดตำแหน่งเจ้าของร้านหรือผู้จัดการได้');
      }
      if (target && target.id !== requesterId && ['OWNER', 'MANAGER'].includes(target.role)) {
        throw new ForbiddenException('ผู้จัดการไม่สามารถแก้ไขบัญชีเจ้าของร้านหรือผู้จัดการคนอื่นได้');
      }
      if (target && target.id === requesterId && newRole && newRole !== target.role) {
        throw new ForbiddenException('ไม่สามารถเปลี่ยนตำแหน่งของตัวเองได้');
      }
    }
    if (requesterRole === 'OWNER' && target?.id === requesterId && newRole && newRole !== 'OWNER') {
      throw new ForbiddenException('ไม่สามารถเปลี่ยนตำแหน่งเจ้าของร้านของตัวเองได้');
    }
    // A second owner could never be demoted, disabled or removed again: the shop's ownership is
    // changed only by the system admin
    if (newRole === 'OWNER' && target?.role !== 'OWNER') {
      throw new ForbiddenException('ตั้งพนักงานเป็นเจ้าของร้านไม่ได้ — ถ้าต้องการโอนร้าน ติดต่อผู้ดูแลระบบ');
    }
  }

  /**
   * Another OWNER account can be managed only by the shop's first owner (the earliest OWNER):
   * that undoes an extra owner made before owners could no longer be handed out.
   */
  private async assertMayManageOwner(target: { id: string; role: string; tenantId?: string | null }, requesterId: string) {
    if (target.role !== 'OWNER' || target.id === requesterId) return;
    const first = await this.prisma.user.findFirst({
      where: { tenantId: target.tenantId ?? undefined, role: 'OWNER' as any },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (first?.id !== requesterId || first?.id === target.id) {
      throw new ForbiddenException('จัดการบัญชีเจ้าของร้านคนอื่นได้เฉพาะเจ้าของร้านคนแรก');
    }
  }

  /** Things this person did that must keep their name: a person with any of them is disabled, not deleted. */
  private async historyOf(userId: string): Promise<number> {
    const p = this.prisma as any;
    const counts = await Promise.all([
      p.sale.count({ where: { OR: [{ userId }, { sellerId: userId }] } }),
      p.shift.count({ where: { userId } }),
      p.repair.count({ where: { technicianId: userId } }),
      p.staffCommission.count({ where: { userId } }),
      p.expense.count({ where: { createdById: userId } }),
      p.packageSale.count({ where: { createdById: userId } }),
      p.cashDrawerTransaction.count({ where: { actorUserId: userId } }),
      p.saleRefund.count({ where: { createdById: userId } }),
      p.purchaseOrder.count({ where: { createdById: userId } }),
      p.repairAdditionalPayment.count({ where: { createdById: userId } }),
      p.dailyClose.count({ where: { closedById: userId } }),
      p.cashDrawerSession.count({ where: { openedById: userId } }),
    ]);
    return counts.reduce((a: number, b: number) => a + b, 0);
  }

  async create(
    dto: { email?: string; username?: string; name: string; phone?: string; password: string; role?: string; branchId?: string },
    requester: { id: string; tenantId: string | null; name?: string; role?: string },
  ) {
    if (dto.role === 'SUPER_ADMIN') throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    this.assertRoleChangeAllowed(requester.role, requester.id, null, dto.role ?? 'CASHIER');
    if (!dto.email && !dto.username) {
      throw new BadRequestException('ต้องระบุ อีเมล หรือ Username อย่างน้อยหนึ่งอย่าง');
    }

    const role = (dto.role as string) || 'CASHIER';
    if (ROLES_REQUIRING_BRANCH.includes(role) && !dto.branchId) {
      throw new BadRequestException('ตำแหน่งนี้ต้องระบุสาขาที่ประจำ');
    }

    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing) throw new ConflictException('Email นี้ถูกใช้งานแล้ว');
    }
    if (dto.username) {
      const existing = await this.prisma.user.findUnique({ where: { username: dto.username.toLowerCase() } });
      if (existing) throw new ConflictException('Username นี้ถูกใช้งานแล้ว');
    }

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email:    dto.email   ?? null,
        username: dto.username ? dto.username.toLowerCase() : null,
        name:     dto.name,
        phone:    dto.phone,
        password: hashed,
        role:     role as any,
        tenantId: requester.tenantId,
        branchId: dto.branchId ?? null,
      },
      select: USER_SELECT,
    });

    await this.auditLog.log({
      actorId:   requester.id,
      actorName: requester.name,
      action:    'USER_CREATED',
      entityType: 'User',
      entityId:   user.id,
      afterData: { email: user.email, name: user.name, role: user.role, branchId: user.branchId },
    });

    if (dto.branchId) {
      await this.notif.notify({
        type:       'USER_ASSIGNED_TO_BRANCH',
        title:      `เพิ่มพนักงานใหม่: ${user.name}`,
        message:    `${user.name} (${role}) ถูกกำหนดประจำสาขาแล้ว`,
        severity:   'INFO',
        entityType: 'User',
        entityId:   user.id,
      });
    }

    return user;
  }

  async update(
    id: string,
    dto: { name?: string; phone?: string; role?: string; email?: string; branchId?: string | null },
    requesterId:  string,
    tenantId:     string | null,
    requesterName?: string,
    requesterRole?: string,
  ) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    if (dto.role === 'SUPER_ADMIN') throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    this.assertRoleChangeAllowed(requesterRole, requesterId, target, dto.role);
    await this.assertMayManageOwner(target as any, requesterId);
    if (dto.email && dto.email !== (target as any).email) {
      const taken = await this.prisma.user.findUnique({ where: { email: dto.email }, select: { id: true } });
      if (taken) throw new ConflictException('อีเมลนี้ถูกใช้งานแล้ว');
    }

    const newRole     = dto.role ?? target.role;
    const newBranchId = 'branchId' in dto ? dto.branchId : (target as any).branchId;

    if (ROLES_REQUIRING_BRANCH.includes(newRole) && !newBranchId) {
      throw new BadRequestException('ตำแหน่งนี้ต้องระบุสาขาที่ประจำ');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        name:     dto.name,
        phone:    dto.phone,
        email:    dto.email,
        role:     dto.role as any,
        ...('branchId' in dto ? { branchId: dto.branchId } : {}),
      },
      select: USER_SELECT,
    });

    // Audit: role change
    if (dto.role && dto.role !== target.role) {
      await this.auditLog.log({
        actorId:   requesterId,
        actorName: requesterName,
        action:    'USER_ROLE_CHANGED',
        entityType: 'User',
        entityId:   id,
        beforeData: { role: target.role },
        afterData:  { role: dto.role, name: target.name },
      });
    }

    // Audit + notify: branch change
    const oldBranchId = (target as any).branchId ?? null;
    const newBranchIdFinal = updated.branchId ?? null;
    if (newBranchIdFinal !== oldBranchId) {
      await this.auditLog.log({
        actorId:   requesterId,
        actorName: requesterName,
        action:    'USER_BRANCH_ASSIGNED',
        entityType: 'User',
        entityId:   id,
        beforeData: { branchId: oldBranchId },
        afterData:  { branchId: newBranchIdFinal, name: target.name },
      });
      await this.notif.notify({
        type:       'USER_ASSIGNED_TO_BRANCH',
        title:      `กำหนดสาขา: ${target.name}`,
        message:    `${target.name} ถูกกำหนดประจำสาขาใหม่`,
        severity:   'INFO',
        entityType: 'User',
        entityId:   id,
      });
    }

    // Audit: general update (only if non-role/branch fields changed)
    if (dto.name || dto.phone || dto.email) {
      await this.auditLog.log({
        actorId:   requesterId,
        actorName: requesterName,
        action:    'USER_UPDATED',
        entityType: 'User',
        entityId:   id,
        afterData: {
          name:  dto.name,
          phone: dto.phone,
          email: dto.email,
        },
      });
    }

    return updated;
  }

  async assignBranch(
    id:               string,
    branchId:         string | null,
    requesterId:      string,
    requesterName?:   string,
    requesterTenantId?: string | null,
    requesterRole?: string,
  ) {
    const target = await this.findOne(id);
    if (requesterTenantId && (target as any).tenantId !== requesterTenantId) {
      throw new ForbiddenException('ไม่มีสิทธิ์แก้ไขผู้ใช้นี้');
    }
    this.assertRoleChangeAllowed(requesterRole, requesterId, target);

    // Verify the destination branch belongs to the same tenant
    if (branchId && requesterTenantId) {
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId }, select: { tenantId: true } });
      if (!branch || branch.tenantId !== requesterTenantId) {
        throw new ForbiddenException('ไม่มีสิทธิ์กำหนดสาขานี้');
      }
    }

    const oldBranchId = (target as any).branchId ?? null;

    const updated = await this.prisma.user.update({
      where: { id },
      data:  { branchId },
      select: USER_SELECT,
    });

    if (oldBranchId !== branchId) {
      await this.auditLog.log({
        actorId:   requesterId,
        actorName: requesterName,
        action:    'USER_BRANCH_ASSIGNED',
        entityType: 'User',
        entityId:   id,
        beforeData: { branchId: oldBranchId },
        afterData:  { branchId, name: target.name },
      });
      await this.notif.notify({
        type:       'USER_ASSIGNED_TO_BRANCH',
        title:      `กำหนดสาขา: ${target.name}`,
        message:    branchId
          ? `${target.name} ถูกกำหนดประจำสาขาใหม่`
          : `${target.name} ถูกยกเลิกการกำหนดสาขา`,
        severity:   'INFO',
        entityType: 'User',
        entityId:   id,
      });
    }

    return updated;
  }

  async toggleActive(id: string, requesterId: string, tenantId: string | null, requesterRole?: string) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    this.assertRoleChangeAllowed(requesterRole, requesterId, target);
    await this.assertMayManageOwner(target as any, requesterId);
    if (id === requesterId) throw new ForbiddenException('Cannot deactivate your own account');

    const toggled = await this.prisma.user.update({
      where: { id },
      data:  { isActive: !target.isActive },
      select: USER_SELECT,
    });
    await this.auditLog.log({
      actorId:   requesterId,
      action:    'USER_STATUS_TOGGLED',
      entityType: 'User',
      entityId:   id,
      afterData:  { isActive: !target.isActive, name: target.name },
    });
    return toggled;
  }

  async resetPassword(id: string, requesterId: string, tenantId: string | null, requesterRole?: string) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    this.assertRoleChangeAllowed(requesterRole, requesterId, target);
    await this.assertMayManageOwner(target as any, requesterId);

    const tempPassword = this.generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);
    await this.prisma.user.update({
      where: { id },
      data: {
        password:            hashed,
        forcePasswordChange: true,
        passwordResetAt:     new Date(),
        passwordResetById:   requesterId,
      },
    });
    await this.auditLog.log({
      actorId:   requesterId,
      action:    'USER_PASSWORD_RESET',
      entityType: 'User',
      entityId:   id,
      afterData:  { userName: target.name },
    });
    return { tempPassword, userName: target.name };
  }

  private generateTempPassword(): string {
    // crypto.randomInt: Math.random is predictable and must not produce credentials
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = 'Tmp';
    for (let i = 0; i < 10; i++) result += chars[randomInt(chars.length)];
    return result;
  }

  async deactivate(id: string) {
    await this.findOne(id);
    return this.prisma.user.update({
      where: { id },
      data:  { isActive: false },
      select: { id: true, isActive: true },
    });
  }

  async deleteUser(id: string, requesterId: string, tenantId: string | null, requesterName?: string) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    if (id === requesterId) throw new BadRequestException('ไม่สามารถลบบัญชีของตัวเองได้');
    await this.assertMayManageOwner(target as any, requesterId);

    // Someone who sold, worked a shift or repaired keeps their name on that history: disable them
    if ((await this.historyOf(id)) > 0) {
      throw new BadRequestException('พนักงานคนนี้มีประวัติการทำงาน (บิล กะ งานซ่อม ฯลฯ) — ใช้ "ปิดใช้งาน" แทนการลบ ประวัติจะยังอยู่ครบ');
    }

    const openRepairs = await this.prisma.repair.count({
      where: { technicianId: id, status: { notIn: ['CANCELLED', 'COMPLETED', 'DELIVERED'] } },
    });
    if (openRepairs > 0) {
      throw new BadRequestException(
        `พนักงานนี้ยังมีงานซ่อมค้างอยู่ ${openRepairs} งาน กรุณาโอนงานออกก่อน`,
      );
    }

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (err: any) {
      if (err?.code === 'P2003') {
        throw new BadRequestException('พนักงานคนนี้มีประวัติในระบบ — ใช้ "ปิดใช้งาน" แทนการลบ');
      }
      throw err;
    }

    await this.auditLog.log({
      actorId:   requesterId,
      actorName: requesterName,
      action:    'USER_DELETED',
      entityType: 'User',
      entityId:   id,
      beforeData: { name: target.name, email: target.email, role: target.role },
    });

    return { success: true };
  }
}
