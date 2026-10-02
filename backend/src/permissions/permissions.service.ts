import { Injectable, OnModuleInit, Logger, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';
import { ALL_PERMISSIONS } from '../auth/strategies/jwt.strategy';
import { CUSTOM_MARKER, DEFAULT_SCOPE, loadRolePermissions } from './role-permissions';

const ROLES: Role[] = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF'];

export const ROLE_PRESETS: Record<string, string[]> = {
  OWNER: ALL_PERMISSIONS,
  MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.view_cost',
    'sales.create', 'sales.discount', 'sales.refund',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'supplier.pay',
    'reports.view',
    'claims.manage',
    'serials.manage',
    'expenses.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view', 'notification.manage',
    'data.export',
    // Cash Drawer — Manager gets all
    'cash_drawer.open_session',
    'cash_drawer.join_session',
    'cash_drawer.withdraw',
    'cash_drawer.deposit',
    'cash_drawer.view_balance',
    'cash_drawer.close_session',
    'cash_drawer.approve_difference',
    'cash_drawer.manual_open',
  ],
  CASHIER: [
    'products.view',
    'sales.create', 'sales.discount',
    'repair.create', 'repair.edit',
    'serials.manage',
    'warranty.view',
    'notification.view',
    // Cash Drawer — Cashier: operational permissions (no approve_difference, no manual_open)
    'cash_drawer.open_session',
    'cash_drawer.join_session',
    'cash_drawer.withdraw',
    'cash_drawer.deposit',
    'cash_drawer.view_balance',
    'cash_drawer.close_session',
  ],
  TECHNICIAN: [
    'products.view',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
    'serials.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view',
    // Cash Drawer — Technician: none by default
  ],
  STOCK_STAFF: [
    'products.view',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'serials.manage',
    'notification.view',
    // Cash Drawer — Stock Staff: none by default
  ],
};

@Injectable()
export class PermissionsService implements OnModuleInit {
  private readonly logger = new Logger(PermissionsService.name)

  constructor(
    private prisma: PrismaService,
    private auditLog: AuditLogService,
    private notif: NotificationsService,
  ) {}

  async onModuleInit() {
    // Seed default permissions for any role that has zero rows in rolePermission.
    // Only runs when the table is completely empty for a role — never overwrites
    // partial configs set by an admin.
    const seedRoles: Role[] = ['MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF'];
    for (const role of seedRoles) {
      const existing = await this.prisma.rolePermission.count({ where: { role, tenantId: DEFAULT_SCOPE } });
      if (existing === 0) {
        const preset = ROLE_PRESETS[role] ?? [];
        if (preset.length > 0) {
          await this.prisma.rolePermission.createMany({
            data: preset.map((permission) => ({ role, permission })),
            skipDuplicates: true,
          });
          this.logger.log(`Seeded ${preset.length} default permissions for role ${role}`);
        }
      }
    }
  }

  getAllPermissions() {
    return ALL_PERMISSIONS;
  }

  // tenantId = null (SUPER_ADMIN / legacy users) reads and edits the system-wide defaults.
  async getRolePermissions(tenantId: string | null) {
    return Promise.all(ROLES.map(async (role) => ({
      role,
      permissions: role === 'OWNER' ? [...ALL_PERMISSIONS] : await loadRolePermissions(this.prisma, role, tenantId),
      isOwner: role === 'OWNER',
    })));
  }

  private async writeRolePermissions(role: Role, permissions: string[], tenantId: string | null) {
    const scope = tenantId ?? DEFAULT_SCOPE;
    const valid = [...new Set(permissions.filter((p) => ALL_PERMISSIONS.includes(p)))];
    const rows  = valid.map((permission) => ({ tenantId: scope, role, permission }));
    // A tenant's own set always carries the marker, so "no permissions" stays customised
    if (tenantId) rows.push({ tenantId: scope, role, permission: CUSTOM_MARKER });

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { tenantId: scope, role } }),
      this.prisma.rolePermission.createMany({ data: rows, skipDuplicates: true }),
    ]);
    return valid;
  }

  async setRolePermissions(role: Role, permissions: string[], tenantId: string | null, actorId?: string, actorName?: string) {
    if (role === 'OWNER') return; // OWNER always has all — ignore

    const saved = await this.writeRolePermissions(role, permissions, tenantId);

    await this.auditLog.log({
      actorId,
      actorName,
      action: 'ROLE_PERMISSIONS_SET',
      entityType: 'Role',
      entityId: role,
      afterData: { permissions: saved, tenantId },
    });

    await this.notif.notify({
      type:       'ROLE_PERMISSION_CHANGED',
      title:      `อัปเดตสิทธิ์: ${role}`,
      message:    `กำหนดสิทธิ์ใหม่ให้กับตำแหน่ง ${role} จำนวน ${saved.length} รายการ`,
      severity:   'INFO',
      entityType: 'Role',
      entityId:   role,
      tenantId,
    });

    return saved.map((permission) => ({ role, permission }));
  }

  async togglePermission(role: Role, permission: string, enabled: boolean, tenantId: string | null, actorId?: string, actorName?: string) {
    if (role === 'OWNER') return;
    if (!ALL_PERMISSIONS.includes(permission)) return;

    // Start from the role's effective set (the defaults if this shop never customised it)
    const current = await loadRolePermissions(this.prisma, role, tenantId);
    const next    = enabled ? [...current, permission] : current.filter((p) => p !== permission);
    await this.writeRolePermissions(role, next, tenantId);

    await this.auditLog.log({
      actorId,
      actorName,
      action: 'ROLE_PERMISSION_TOGGLED',
      entityType: 'Role',
      entityId: role,
      afterData: { permission, enabled, tenantId },
    });

    await this.notif.notify({
      type:       'ROLE_PERMISSION_CHANGED',
      title:      `เปลี่ยนสิทธิ์: ${role}`,
      message:    `${enabled ? 'เปิด' : 'ปิด'} สิทธิ์ ${permission} สำหรับตำแหน่ง ${role}`,
      severity:   'INFO',
      entityType: 'Role',
      entityId:   role,
      tenantId,
    });
  }

  async applyPreset(role: Role, tenantId: string | null, actorId?: string, actorName?: string) {
    if (role === 'OWNER') return;

    const preset = ROLE_PRESETS[role] ?? [];
    return this.setRolePermissions(role, preset, tenantId, actorId, actorName);
  }

  // ── Per-user permission grants ──────────────────────────────────────────────

  // Tenant isolation: callers can only touch users of their own tenant
  private async assertSameTenant(userId: string, callerTenantId?: string | null, callerRole?: string) {
    if (callerRole === 'SUPER_ADMIN' || !callerTenantId) return;
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });
    if (!target || target.tenantId !== callerTenantId) {
      throw new ForbiddenException('ไม่มีสิทธิ์จัดการผู้ใช้ของ Tenant อื่น');
    }
  }

  async getUserGrants(userId: string, callerTenantId?: string | null, callerRole?: string) {
    await this.assertSameTenant(userId, callerTenantId, callerRole);
    const rows = await this.prisma.userPermission.findMany({
      where: { userId },
      select: { permission: true, createdAt: true },
      orderBy: { permission: 'asc' },
    });
    return rows.map((r) => r.permission);
  }

  async grantToUser(
    userId: string,
    permission: string,
    actorId: string,
    actorName?: string,
    callerTenantId?: string | null,
    callerRole?: string,
  ) {
    if (!ALL_PERMISSIONS.includes(permission)) {
      throw new BadRequestException(`สิทธิ์ไม่ถูกต้อง: ${permission}`);
    }
    await this.assertSameTenant(userId, callerTenantId, callerRole);
    await this.prisma.userPermission.upsert({
      where: { userId_permission: { userId, permission } },
      create: { userId, permission, grantedById: actorId },
      update: {},
    });
    await this.auditLog.log({
      actorId,
      actorName,
      action: 'USER_PERMISSION_GRANTED',
      entityType: 'User',
      entityId: userId,
      afterData: { permission },
    });
    return { userId, permission, granted: true };
  }

  async revokeFromUser(
    userId: string,
    permission: string,
    actorId: string,
    actorName?: string,
    callerTenantId?: string | null,
    callerRole?: string,
  ) {
    await this.assertSameTenant(userId, callerTenantId, callerRole);
    await this.prisma.userPermission.deleteMany({ where: { userId, permission } });
    await this.auditLog.log({
      actorId,
      actorName,
      action: 'USER_PERMISSION_REVOKED',
      entityType: 'User',
      entityId: userId,
      afterData: { permission },
    });
    return { userId, permission, granted: false };
  }
}
