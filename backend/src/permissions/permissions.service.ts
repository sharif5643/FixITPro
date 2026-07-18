import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Role } from '@prisma/client';
import { ALL_PERMISSIONS } from '../auth/strategies/jwt.strategy';

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
      const existing = await this.prisma.rolePermission.count({ where: { role } });
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

  async getRolePermissions() {
    const rows = await this.prisma.rolePermission.findMany();
    const map: Record<string, string[]> = {};

    for (const role of ROLES) {
      map[role] = role === 'OWNER' ? [...ALL_PERMISSIONS] : [];
    }

    for (const row of rows) {
      if (map[row.role]) map[row.role].push(row.permission);
    }

    return ROLES.map((role) => ({
      role,
      permissions: map[role],
      isOwner: role === 'OWNER',
    }));
  }

  async setRolePermissions(role: Role, permissions: string[], actorId?: string, actorName?: string) {
    if (role === 'OWNER') return; // OWNER always has all — ignore

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({ where: { role } }),
      this.prisma.rolePermission.createMany({
        data: permissions
          .filter((p) => ALL_PERMISSIONS.includes(p))
          .map((permission) => ({ role, permission })),
        skipDuplicates: true,
      }),
    ]);

    await this.auditLog.log({
      actorId,
      actorName,
      action: 'ROLE_PERMISSIONS_SET',
      entityType: 'Role',
      entityId: role,
      afterData: { permissions },
    });

    await this.notif.notify({
      type:       'ROLE_PERMISSION_CHANGED',
      title:      `อัปเดตสิทธิ์: ${role}`,
      message:    `กำหนดสิทธิ์ใหม่ให้กับตำแหน่ง ${role} จำนวน ${permissions.length} รายการ`,
      severity:   'INFO',
      entityType: 'Role',
      entityId:   role,
    });

    return this.prisma.rolePermission.findMany({ where: { role } });
  }

  async togglePermission(role: Role, permission: string, enabled: boolean, actorId?: string, actorName?: string) {
    if (role === 'OWNER') return;
    if (!ALL_PERMISSIONS.includes(permission)) return;

    if (enabled) {
      await this.prisma.rolePermission.upsert({
        where: { role_permission: { role, permission } },
        create: { role, permission },
        update: {},
      });
    } else {
      await this.prisma.rolePermission.deleteMany({ where: { role, permission } });
    }

    await this.auditLog.log({
      actorId,
      actorName,
      action: 'ROLE_PERMISSION_TOGGLED',
      entityType: 'Role',
      entityId: role,
      afterData: { permission, enabled },
    });

    await this.notif.notify({
      type:       'ROLE_PERMISSION_CHANGED',
      title:      `เปลี่ยนสิทธิ์: ${role}`,
      message:    `${enabled ? 'เปิด' : 'ปิด'} สิทธิ์ ${permission} สำหรับตำแหน่ง ${role}`,
      severity:   'INFO',
      entityType: 'Role',
      entityId:   role,
    });
  }

  async applyPreset(role: Role, actorId?: string, actorName?: string) {
    if (role === 'OWNER') return;

    const preset = ROLE_PRESETS[role] ?? [];
    return this.setRolePermissions(role, preset, actorId, actorName);
  }
}
