// Navigation data for Super Admin V2 — pure TS (no JSX), safe to import in tests.
import {
  LayoutDashboard, Building2, GitBranch, Users, Package, Puzzle,
  CreditCard, Banknote, BarChart3, ScrollText, Settings, Wrench, ShieldCheck,
} from 'lucide-react'

export interface SANavItem {
  href: string
  label: string
  icon: React.ElementType
  exact?: boolean
  badge?: string
}

export interface SANavGroup {
  label: string
  items: SANavItem[]
}

export const SA_NAV_GROUPS: SANavGroup[] = [
  {
    label: 'Platform',
    items: [
      { href: '/super-admin',          label: 'Dashboard',  icon: LayoutDashboard, exact: true },
      { href: '/super-admin/tenants',  label: 'ร้านค้า',    icon: Building2 },
      { href: '/super-admin/branches', label: 'สาขา',       icon: GitBranch },
      { href: '/super-admin/users',    label: 'ผู้ใช้งาน', icon: Users },
      { href: '/super-admin/packages', label: 'แพ็กเกจ',   icon: Package },
      { href: '/super-admin/modules',  label: 'โมดูล',     icon: Puzzle },
    ],
  },
  {
    label: 'Revenue',
    items: [
      { href: '/super-admin/subscriptions', label: 'Subscriptions', icon: CreditCard },
      { href: '/super-admin/payments',      label: 'Payments',      icon: Banknote },
    ],
  },
  {
    label: 'System',
    items: [
      { href: '/super-admin/analytics',   label: 'Analytics',   icon: BarChart3 },
      { href: '/super-admin/audit-logs', label: 'Audit Logs',  icon: ScrollText },
      { href: '/super-admin/settings',   label: 'Settings',    icon: Settings },
      { href: '/super-admin/data-repair', label: 'Data Repair', icon: Wrench },
      { href: '/super-admin/production',  label: 'Production',  icon: ShieldCheck },
    ],
  },
]

export const SA_NAV_ITEMS: SANavItem[] = SA_NAV_GROUPS.flatMap((g) => g.items)
