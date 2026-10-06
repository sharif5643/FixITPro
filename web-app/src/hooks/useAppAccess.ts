'use client'

import { useAuthStore } from '@/store/auth.store'

type Area = 'repairs' | 'pos' | 'stock' | 'customers' | 'reports' | 'sim' | 'money'

/**
 * Areas each role has in the web menu (components/shell/side-nav.tsx): a technician has repairs
 * only, a cashier selling and repairs, stock staff stock. OWNER and MANAGER share the full menu.
 */
const ROLE_AREAS: Record<string, Area[]> = {
  TECHNICIAN:  ['repairs'],
  CASHIER:     ['repairs', 'pos', 'customers', 'sim', 'money'],
  STOCK_STAFF: ['stock'],
}

/**
 * What the staff app and the SUNMI screens may show, by the same role, permission and module rules
 * as the web menu. OWNER passes every permission; modules follow the shop's package.
 */
export function useAppAccess() {
  const role      = useAuthStore((s) => s.user?.role ?? '')
  const hasPerm   = useAuthStore((s) => s.hasPermission)
  const hasModule = useAuthStore((s) => s.hasModule)
  const perms     = useAuthStore((s) => s.permissions)
  const areas     = ROLE_AREAS[role]
  const has       = (a: Area) => !areas || areas.includes(a)
  return {
    repairs:   has('repairs') && hasModule('repair'),
    intake:    has('repairs') && hasModule('repair') && hasPerm('repair.create'),
    pos:       has('pos') && hasModule('pos') && hasPerm('sales.create'),
    stock:     has('stock') && hasModule('stock') && hasPerm('products.view'),
    transfers: has('stock') && hasModule('stock') && hasPerm('stock.transfer'),
    customers: has('customers') && hasModule('crm'),
    reports:   has('reports') && hasModule('report') && hasPerm('reports.view'),
    sim:       has('sim') && hasModule('package_sales'),
    shift:     has('money'),
    debt:      has('money') && hasPerm('repair.close'),
    expenses:  has('money') && hasModule('finance') && hasPerm('expenses.manage'),
    drawer:    hasPerm('cash_drawer.view_balance'),
    settings:  hasPerm('settings.manage'),
    // Does repair work: technicians, and anyone the owner gave "เป็นช่างซ่อม" (repair.technician)
    myRepairs: hasModule('repair') && (role === 'TECHNICIAN' || (role !== 'OWNER' && role !== 'SUPER_ADMIN' && perms.includes('repair.technician'))),
  }
}
