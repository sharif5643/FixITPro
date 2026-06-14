'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { X,
  LayoutDashboard, Package, ShoppingCart, Wrench, Users,
  Clock, Smartphone, Tag, Barcode, Settings, CreditCard, Building2,
  ClipboardList, ShieldCheck, FileWarning, UserCog, ShieldAlert, AlertCircle,
  BookOpen, Receipt, TrendingUp, FileSpreadsheet, ScrollText, Bell, Database, BadgeCheck, BarChart2, FolderInput, GitBranch, ArrowRightLeft,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

// ── Navigation structure ──────────────────────────────────────────────────────

type NavItem = {
  href: string
  icon: React.ElementType
  label: string
  permission: string | null
  ownerOnly?: true
  module?: string
}

type NavSection = {
  label: string | null
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'แดชบอร์ด', permission: null },
    ],
  },
  {
    label: 'การขาย',
    items: [
      { href: '/sales',    icon: ShoppingCart, label: 'ขายสินค้า (POS)', permission: 'sales.create',    module: 'pos'     },
      { href: '/repairs',  icon: Wrench,       label: 'งานซ่อม',          permission: 'repair.create',   module: 'repair'  },
      { href: '/shifts',   icon: Clock,        label: 'เปิด/ปิดกะ',       permission: null },
      { href: '/expenses', icon: Receipt,      label: 'ค่าใช้จ่าย',        permission: 'expenses.manage', module: 'finance' },
    ],
  },
  {
    label: 'สินค้า',
    items: [
      { href: '/products',      icon: Package,        label: 'สินค้า',          permission: 'products.view',  module: 'stock' },
      { href: '/categories',    icon: Tag,            label: 'หมวดหมู่สินค้า',  permission: 'products.view',  module: 'stock' },
      { href: '/barcode-print', icon: Barcode,        label: 'พิมพ์ Barcode',   permission: 'products.view',  module: 'stock' },
      { href: '/transfers',     icon: ArrowRightLeft, label: 'โอนสต๊อก',        permission: 'stock.transfer', module: 'stock' },
    ],
  },
  {
    label: 'ลูกค้า',
    items: [
      { href: '/customers', icon: Users,       label: 'ลูกค้า',       permission: null, module: 'crm' },
      { href: '/debt',      icon: AlertCircle, label: 'หนี้ค้างชำระ', permission: null, ownerOnly: true, module: 'crm' },
    ],
  },
  {
    label: 'รายงาน',
    items: [
      { href: '/reports/daily-closing', icon: BookOpen,   label: 'รายงานปิดวัน',     permission: 'reports.view', module: 'report' },
      { href: '/reports/profit',        icon: TrendingUp, label: 'รายงานกำไร',       permission: 'reports.view', module: 'report' },
      { href: '/analytics',             icon: BarChart2,  label: 'วิเคราะห์เชิงลึก', permission: 'reports.view', module: 'report' },
    ],
  },
  {
    label: 'การจัดซื้อ',
    items: [
      { href: '/suppliers',         icon: Building2,       label: 'ซัพพลายเออร์',    permission: 'purchase.create', module: 'finance' },
      { href: '/purchase-orders',   icon: ClipboardList,   label: 'ใบสั่งซื้อ (PO)', permission: 'purchase.create', module: 'finance' },
      { href: '/reports/payables',  icon: FileSpreadsheet, label: 'รายงานเจ้าหนี้',  permission: 'reports.view',    module: 'finance' },
    ],
  },
  {
    label: 'จัดการ',
    items: [
      { href: '/serials',       icon: ShieldCheck, label: 'Serial / IMEI',    permission: 'serials.manage',   module: 'stock'           },
      { href: '/claims',        icon: FileWarning, label: 'จัดการเคลม',       permission: 'claims.manage',    module: 'repair'          },
      { href: '/warranties',    icon: BadgeCheck,  label: 'การรับประกัน',     permission: 'warranty.view',    module: 'repair'          },
      { href: '/technicians',   icon: BarChart2,   label: 'ประสิทธิภาพช่าง',  permission: 'technician.view',  module: 'repair'          },
      { href: '/employees',     icon: UserCog,     label: 'พนักงาน',          permission: null, ownerOnly: true, module: 'user_management' },
      { href: '/roles',         icon: ShieldAlert, label: 'สิทธิ์การใช้งาน', permission: null, ownerOnly: true, module: 'user_management' },
      { href: '/branches',      icon: GitBranch,   label: 'สาขา',             permission: 'branches.manage', ownerOnly: true, module: 'user_management' },
      { href: '/data-tools',    icon: FolderInput, label: 'เครื่องมือข้อมูล', permission: 'data.export',     module: 'report'          },
      { href: '/notifications', icon: Bell,        label: 'การแจ้งเตือน',     permission: 'notification.view' },
      { href: '/backup',        icon: Database,    label: 'Backup ข้อมูล',    permission: 'system.backup', ownerOnly: true, module: 'report' },
      { href: '/audit-logs',    icon: ScrollText,  label: 'ประวัติกิจกรรม',  permission: 'audit.view',      module: 'report'          },
      { href: '/settings',      icon: Settings,    label: 'ตั้งค่า',          permission: 'settings.manage' },
      { href: '/subscription',  icon: CreditCard,  label: 'Subscription',    permission: null, ownerOnly: true },
    ],
  },
]

// ── Portal label ──────────────────────────────────────────────────────────────

const PORTAL_LABEL: Record<string, string> = {
  OWNER:       'Owner Portal',
  SUPER_ADMIN: 'Super Admin',
  MANAGER:     'Manager Portal',
  CASHIER:     'Cashier',
  TECHNICIAN:  'Technician',
  STOCK_STAFF: 'Stock Staff',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname    = usePathname()
  const user        = useAuthStore((s) => s.user)
  const hasPerm     = useAuthStore((s) => s.hasPermission)
  const hasModule   = useAuthStore((s) => s.hasModule)
  const isOwner     = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const portalLabel = PORTAL_LABEL[user?.role ?? ''] ?? 'Portal'

  const { data: shopSettings } = useQuery<ShopSettings>({
    queryKey: ['shop-settings'],
    queryFn: async () => (await api.get('/settings/shop')).data,
    staleTime: 5 * 60_000,
  })

  const shopName = shopSettings?.shopName ?? 'FixITPro'

  function isItemVisible(item: NavItem): boolean {
    if (item.ownerOnly && !isOwner) return false
    if (item.permission && !hasPerm(item.permission)) return false
    if (item.module && !hasModule(item.module)) return false
    return true
  }

  function isActive(href: string): boolean {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const navContent = (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-3">
      {navSections.map((section, si) => {
        const visibleItems = section.items.filter(isItemVisible)
        if (visibleItems.length === 0) return null

        return (
          <div key={si} className="mb-1">
            {/* Section separator + label — only visible when expanded */}
            {section.label && (
              <div className="mx-3 mb-1 mt-3 overflow-hidden">
                {si > 0 && (
                  <div className="h-px bg-slate-100 mb-2 opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75" />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 select-none">
                  {section.label}
                </p>
              </div>
            )}

            {/* Items */}
            {visibleItems.map((item) => {
              const active = isActive(item.href)
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'group/item relative flex items-center gap-3 mx-2 my-0.5 px-2 py-2.5 rounded-xl transition-all',
                    active
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
                  )}
                >
                  {/* Icon */}
                  <Icon className={cn(
                    'h-5 w-5 flex-shrink-0 transition-colors',
                    active ? 'text-white' : 'text-slate-400 group-hover/item:text-slate-700',
                  )} />

                  {/* Label — appears on expand */}
                  <span className={cn(
                    'text-sm font-medium whitespace-nowrap overflow-hidden transition-all duration-150 delay-75',
                    'opacity-0 group-hover:opacity-100 max-w-0 group-hover:max-w-[200px]',
                    active ? 'text-white' : '',
                  )}>
                    {item.label}
                  </span>

                  {/* Active indicator dot (collapsed only — hidden on expand) */}
                  {active && (
                    <span className="absolute right-1.5 top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-white/70 group-hover:hidden flex-shrink-0" />
                  )}
                </Link>
              )
            })}
          </div>
        )
      })}
    </nav>
  )

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      {/* Sidebar shell */}
      <aside
        className={cn(
          // Base styles
          'group flex flex-col flex-shrink-0',
          'bg-white dark:bg-slate-900',
          'border-r border-slate-200 dark:border-slate-800',
          'overflow-hidden',
          // Desktop: always visible, collapses to icon rail
          'hidden md:flex md:relative md:w-16 md:hover:w-60',
          'md:transition-[width] md:duration-200 md:ease-in-out',
          // Mobile: overlay when open
          open && 'fixed inset-y-0 left-0 z-50 !flex !w-60 shadow-2xl',
        )}
      >
        {/* Logo bar */}
        <div className="flex h-14 items-center flex-shrink-0 px-3 border-b border-slate-100 overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700">
          {/* Brand icon */}
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-sm backdrop-blur-sm border border-white/20">
            <Smartphone className="h-5 w-5 text-white" />
          </div>

          {/* Brand name (hidden when collapsed) */}
          <div className="ml-3 min-w-0 flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 overflow-hidden">
            <p className="text-sm font-bold text-white truncate leading-none">
              {shopName}
            </p>
            <p className="text-[10px] text-blue-200 mt-0.5">{portalLabel}</p>
          </div>

          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="ml-2 flex-shrink-0 p-1.5 rounded-lg hover:bg-white/20 md:hidden opacity-0 group-hover:opacity-100 transition-opacity"
            aria-label="ปิดเมนู"
          >
            <X className="h-4 w-4 text-white/80" />
          </button>
        </div>

        {/* Navigation */}
        {navContent}

        {/* Bottom: user info */}
        <div className="flex-shrink-0 border-t border-slate-100 p-3 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 shadow-sm">
              <span className="text-xs font-bold text-white">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
              <p className="text-xs font-semibold text-slate-900 truncate leading-none">
                {user?.name}
              </p>
              <span className="inline-flex items-center mt-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 text-[9px] font-semibold">
                {portalLabel}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
