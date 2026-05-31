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

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: USER_SELECT });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(
    dto: { email: string; name: string; phone?: string; password: string; role?: string; branchId?: string },
    requester: { id: string; tenantId: string | null; name?: string },
  ) {
    if (dto.role === 'SUPER_ADMIN') throw new ForbiddenException('Cannot assign SUPER_ADMIN role');

    const role = (dto.role as string) || 'CASHIER';
    if (ROLES_REQUIRING_BRANCH.includes(role) && !dto.branchId) {
      throw new BadRequestException('ตำแหน่งนี้ต้องระบุสาขาที่ประจำ');
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already in use');

    const hashed = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        email:    dto.email,
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
  ) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    if (dto.role === 'SUPER_ADMIN') throw new ForbiddenException('Cannot assign SUPER_ADMIN role');
    if (target.role === 'OWNER' && id !== requesterId) {
      throw new ForbiddenException('Cannot modify another OWNER');
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
    id:          string,
    branchId:    string | null,
    requesterId: string,
    requesterName?: string,
  ) {
    const target = await this.findOne(id);
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

  async toggleActive(id: string, requesterId: string, tenantId: string | null) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot deactivate OWNER account');
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

  async resetPassword(id: string, requesterId: string, tenantId: string | null) {
    const target = await this.findOne(id);
    if (target.tenantId !== tenantId) throw new ForbiddenException('Access denied');
    if (target.role === 'OWNER' && id !== requesterId) {
      throw new ForbiddenException("Cannot reset another OWNER's password");
    }

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
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let result = 'Tmp';
    for (let i = 0; i < 8; i++) result += chars[Math.floor(Math.random() * chars.length)];
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
}
