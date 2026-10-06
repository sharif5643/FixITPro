import { Role } from '@prisma/client';
import { loadRolePermissions } from './role-permissions';

export const REPAIR_TECHNICIAN = 'repair.technician';

type Reader = Parameters<typeof loadRolePermissions>[0];

/**
 * Who does repair work in a shop: technicians, every role the shop gave "repair.technician"
 * (e.g. a manager who also repairs), and people given it personally. A Prisma `where` for User.
 */
export async function repairTechnicianWhere(prisma: Reader, tenantId: string | null | undefined) {
  const roles: Role[] = ['TECHNICIAN'];
  for (const role of ['MANAGER', 'CASHIER', 'STOCK_STAFF'] as Role[]) {
    const perms = await loadRolePermissions(prisma, role, tenantId);
    if (perms.includes(REPAIR_TECHNICIAN)) roles.push(role);
  }
  return {
    OR: [
      { role: { in: roles } },
      { userPermissions: { some: { permission: REPAIR_TECHNICIAN } } },
    ],
  };
}
