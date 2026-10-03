/**
 * Permission a dashboard page needs, mirroring the sidebar rules (components/shell/side-nav.tsx).
 * Without it, e.g. a technician who opened /sales saw "open a shift first" instead of being
 * told the page isn't theirs. The API enforces the same permissions; this is only the message.
 */
const ROUTE_PERMISSIONS: [prefix: string, permission: string][] = [
  ['/sales', 'sales.create'],
  ['/expenses', 'expenses.manage'],
  ['/purchase-orders', 'purchase.create'],
  ['/suppliers', 'purchase.create'],
  ['/reports', 'reports.view'],
  ['/analytics', 'reports.view'],
  ['/finance', 'reports.view'],
  ['/settings', 'settings.manage'],
]

export function requiredPermissionFor(pathname: string): string | null {
  for (const [prefix, permission] of ROUTE_PERMISSIONS) {
    if (pathname === prefix || pathname.startsWith(prefix + '/')) return permission
  }
  return null
}
