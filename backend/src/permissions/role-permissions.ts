import { Role } from '@prisma/client';

// RolePermission.tenantId: '' = system-wide defaults, otherwise that tenant's own set.
export const DEFAULT_SCOPE = '';
// Stored with a tenant's set so an intentionally empty set still counts as customised.
export const CUSTOM_MARKER = '__custom__';

type RolePermissionReader = {
  rolePermission: {
    findMany(args: any): Promise<{ permission: string }[]>;
  };
};

// Effective permissions of a role for a tenant: the tenant's own set if it has one,
// otherwise the system-wide defaults.
export async function loadRolePermissions(
  prisma: RolePermissionReader,
  role: Role | string,
  tenantId: string | null | undefined,
): Promise<string[]> {
  if (tenantId) {
    const own = await prisma.rolePermission.findMany({
      where:  { tenantId, role: role as Role },
      select: { permission: true },
    });
    if (own.length > 0) return own.map((r) => r.permission).filter((p) => p !== CUSTOM_MARKER);
  }
  const defaults = await prisma.rolePermission.findMany({
    where:  { tenantId: DEFAULT_SCOPE, role: role as Role },
    select: { permission: true },
  });
  return defaults.map((r) => r.permission);
}
