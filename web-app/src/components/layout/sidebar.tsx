'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import {
  X, ChevronDown, ChevronRight,
  LayoutDashboard, Package, ShoppingCart, Wrench, Users,
  Clock, Smartphone, Tag, Barcode, Settings, CreditCard, Building2,
  ClipboardList, ShieldCheck, FileWarning, UserCog, ShieldAlert, AlertCircle,
  BookOpen, Receipt, TrendingUp, FileSpreadsheet, ScrollText, Bell, Database,
  BadgeCheck, BarChart2, FolderInput, GitBranch, ArrowRightLeft, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useShopName } from '@/hooks/useShopName'

// ── Types ─────────────────────────────────────────────────────────────────────

type NavItem = {
  href: string
  icon: React.ElementType
  label: string
  permission?: string | null
  ownerOnly?: true
  module?: string
  statusParam?: string
}

type NavSection = {
  label: string | null
  items: NavItem[]
}

// ── Nav definitions ───────────────────────────────────────────────────────────

const OWNER_PRIMARY: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' },
    ],
  },
  {
    label: 'งานซ่อม',
    items: [
      { href: '/repairs',   icon: Wrench,       label: 'งานซ่อม',  permission: 'repair.create', module: 'repair' },
      { href: '/reminders', icon: CalendarDays, label: 'นัดหมาย',  permission: 'repair.create', module: 'repair' },
    ],
  },
  {
    label: 'การขาย',
    items: [
      { href: '/sales',  icon: ShoppingCart, label: 'ขายสินค้า (POS)', permission: 'sales.create', module: 'pos' },
      { href: '/shifts', icon: Clock,        label: 'เปิด/ปิดกะ' },
    ],
  },
  {
    label: 'สต็อก',
    items: [
      { href: '/products',  icon: Package,        label: 'สินค้า',    permission: 'products.view',  module: 'stock' },
      { href: '/transfers', icon: ArrowRightLeft, label: 'โอนสต๊อก', permission: 'stock.transfer', module: 'stock' },
    ],
  },
  {
    label: 'ลูกค้า',
    items: [
      { href: '/customers', icon: Users,       label: 'ลูกค้า',       module: 'crm' },
      { href: '/debt',      icon: AlertCircle, label: 'หนี้ค้างชำระ', ownerOnly: true, module: 'crm' },
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
]

const OWNER_SECONDARY: NavSection[] = [
  {
    label: 'การเงิน',
    items: [
      { href: '/expenses',         icon: Receipt,         label: 'ค่าใช้จ่าย',      permission: 'expenses.manage', module: 'finance' },
      { href: '/suppliers',        icon: Building2,       label: 'ซัพพลายเออร์',    permission: 'purchase.create', module: 'finance' },
      { href: '/purchase-orders',  icon: ClipboardList,   label: 'ใบสั่งซื้อ (PO)', permission: 'purchase.create', module: 'finance' },
      { href: '/reports/payables', icon: FileSpreadsheet, label: 'รายงานเจ้าหนี้',  permission: 'reports.view',    module: 'finance' },
    ],
  },
  {
    label: 'รับประกัน & เคลม',
    items: [
      { href: '/warranties', icon: BadgeCheck,  label: 'การรับประกัน',  permission: 'warranty.view',  module: 'repair' },
      { href: '/claims',     icon: FileWarning, label: 'จัดการเคลม',    permission: 'claims.manage',  module: 'repair' },
      { href: '/serials',    icon: ShieldCheck, label: 'Serial / IMEI', permission: 'serials.manage', module: 'stock'  },
    ],
  },
  {
    label: 'ช่างและพนักงาน',
    items: [
      { href: '/technicians', icon: BarChart2,  label: 'ประสิทธิภาพช่าง',  permission: 'technician.view',  module: 'repair'          },
      { href: '/employees',   icon: UserCog,    label: 'พนักงาน',           ownerOnly: true, module: 'user_management' },
      { href: '/roles',       icon: ShieldAlert, label: 'สิทธิ์การใช้งาน', ownerOnly: true, module: 'user_management' },
      { href: '/branches',    icon: GitBranch,   label: 'สาขา',             permission: 'branches.manage', ownerOnly: true, module: 'user_management' },
    ],
  },
  {
    label: 'ตั้งค่าสต็อก',
    items: [
      { href: '/categories',    icon: Tag,    label: 'หมวดหมู่',      permission: 'products.view', module: 'stock' },
      { href: '/barcode-print', icon: Barcode, label: 'พิมพ์ Barcode', permission: 'products.view', module: 'stock' },
    ],
  },
  {
    label: 'ระบบ',
    items: [
      { href: '/data-tools',    icon: FolderInput, label: 'เครื่องมือข้อมูล', permission: 'data.export',     module: 'report' },
      { href: '/notifications', icon: Bell,        label: 'การแจ้งเตือน',     permission: 'notification.view' },
      { href: '/backup',        icon: Database,    label: 'Backup ข้อมูล',    permission: 'system.backup', ownerOnly: true, module: 'report' },
      { href: '/audit-logs',    icon: ScrollText,  label: 'ประวัติกิจกรรม',  permission: 'audit.view',      module: 'report' },
      { href: '/settings',      icon: Settings,    label: 'ตั้งค่า',          permission: 'settings.manage' },
      { href: '/subscription',  icon: CreditCard,  label: 'Subscription',    ownerOnly: true },
    ],
  },
]

const MANAGER_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' },
    ],
  },
  {
    label: 'งานซ่อม',
    items: [
      { href: '/repairs',    icon: Wrench,       label: 'งานซ่อม',       permission: 'repair.create',  module: 'repair' },
      { href: '/reminders',  icon: CalendarDays, label: 'นัดหมาย',       permission: 'repair.create',  module: 'repair' },
      { href: '/warranties', icon: BadgeCheck,   label: 'การรับประกัน',  permission: 'warranty.view',  module: 'repair' },
      { href: '/claims',     icon: FileWarning,  label: 'จัดการเคลม',    permission: 'claims.manage',  module: 'repair' },
    ],
  },
  {
    label: 'การขาย',
    items: [
      { href: '/sales',    icon: ShoppingCart, label: 'ขายสินค้า (POS)', permission: 'sales.create',    module: 'pos'     },
      { href: '/shifts',   icon: Clock,        label: 'เปิด/ปิดกะ' },
      { href: '/expenses', icon: Receipt,      label: 'ค่าใช้จ่าย',      permission: 'expenses.manage', module: 'finance' },
    ],
  },
  {
    label: 'สต็อก',
    items: [
      { href: '/products',  icon: Package,        label: 'สินค้า',    permission: 'products.view',  module: 'stock' },
      { href: '/transfers', icon: ArrowRightLeft, label: 'โอนสต๊อก', permission: 'stock.transfer', module: 'stock' },
    ],
  },
  {
    label: 'ลูกค้า',
    items: [
      { href: '/customers', icon: Users, label: 'ลูกค้า', module: 'crm' },
    ],
  },
  {
    label: 'รายงาน',
    items: [
      { href: '/reports/daily-closing', icon: BookOpen,   label: 'รายงานปิดวัน',     permission: 'reports.view', module: 'report' },
      { href: '/reports/profit',        icon: TrendingUp, label: 'รายงานกำไร',       permission: 'reports.view', module: 'report' },
      { href: '/analytics',             icon: BarChart2,  label: 'วิเคราะห์เชิงลึก', permission: 'reports.view', module: 'report' },
      { href: '/technicians',           icon: UserCog,    label: 'ประสิทธิภาพช่าง',  permission: 'technician.view' },
    ],
  },
  {
    label: 'จัดการ',
    items: [
      { href: '/purchase-orders', icon: ClipboardList, label: 'ใบสั่งซื้อ (PO)', permission: 'purchase.create', module: 'finance' },
      { href: '/categories',      icon: Tag,           label: 'หมวดหมู่',         permission: 'products.view',   module: 'stock'   },
      { href: '/barcode-print',   icon: Barcode,       label: 'พิมพ์ Barcode',    permission: 'products.view',   module: 'stock'   },
      { href: '/notifications',   icon: Bell,          label: 'การแจ้งเตือน',     permission: 'notification.view' },
      { href: '/settings',        icon: Settings,      label: 'ตั้งค่า',          permission: 'settings.manage' },
    ],
  },
]

const CASHIER_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' },
    ],
  },
  {
    label: 'การขาย',
    items: [
      { href: '/sales',  icon: ShoppingCart, label: 'ขายสินค้า (POS)', module: 'pos' },
      { href: '/shifts', icon: Clock,        label: 'เปิด/ปิดกะ' },
    ],
  },
  {
    label: 'งานซ่อม',
    items: [
      { href: '/repairs', icon: Wrench, label: 'รับชำระงานซ่อม', module: 'repair' },
    ],
  },
  {
    label: 'ลูกค้า',
    items: [
      { href: '/customers',     icon: Users, label: 'ลูกค้า',        module: 'crm' },
      { href: '/notifications', icon: Bell,  label: 'การแจ้งเตือน' },
    ],
  },
]

const TECHNICIAN_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'งานของฉัน' },
    ],
  },
  {
    label: 'งานซ่อม',
    items: [
      { href: '/repairs',                      icon: Wrench,     label: 'งานซ่อมทั้งหมด', module: 'repair' },
      { href: '/repairs?status=WAITING_PARTS', icon: Package,    label: 'งานรออะไหล่',    module: 'repair', statusParam: 'WAITING_PARTS' },
      { href: '/repairs?status=QC_PENDING',    icon: BadgeCheck, label: 'งานรอ QC',       module: 'repair', statusParam: 'QC_PENDING' },
    ],
  },
  {
    label: null,
    items: [
      { href: '/notifications', icon: Bell, label: 'การแจ้งเตือน' },
    ],
  },
]

const STOCK_STAFF_SECTIONS: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' },
    ],
  },
  {
    label: 'สต็อก',
    items: [
      { href: '/products',      icon: Package,        label: 'สินค้าทั้งหมด',   permission: 'products.view',  module: 'stock' },
      { href: '/categories',    icon: Tag,            label: 'หมวดหมู่สินค้า',  permission: 'products.view',  module: 'stock' },
      { href: '/barcode-print', icon: Barcode,        label: 'พิมพ์ Barcode',   permission: 'products.view',  module: 'stock' },
      { href: '/transfers',     icon: ArrowRightLeft, label: 'โอนสต๊อก',        permission: 'stock.transfer', module: 'stock' },
    ],
  },
  {
    label: 'จัดซื้อ',
    items: [
      { href: '/purchase-orders', icon: ClipboardList, label: 'รับสินค้าเข้า (PO)', permission: 'purchase.create', module: 'finance' },
      { href: '/suppliers',       icon: Building2,     label: 'ซัพพลายเออร์',        permission: 'purchase.create', module: 'finance' },
      { href: '/serials',         icon: ShieldCheck,   label: 'Serial / IMEI',        permission: 'serials.manage',  module: 'stock'  },
    ],
  },
  {
    label: null,
    items: [
      { href: '/notifications', icon: Bell, label: 'การแจ้งเตือน' },
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

// ── Inner nav component (uses useSearchParams — must be in Suspense) ───────────

interface SidebarNavProps {
  role: string
  hasPerm: (p: string) => boolean
  hasModule: (m: string) => boolean
  isOwner: boolean
}

function SidebarNav({ role, hasPerm, hasModule, isOwner }: SidebarNavProps) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const [othersOpen, setOthersOpen] = useState(false)

  function isVisible(item: NavItem): boolean {
    if (item.ownerOnly && !isOwner) return false
    if (item.permission && !hasPerm(item.permission)) return false
    if (item.module && !hasModule(item.module)) return false
    return true
  }

  function isActive(item: NavItem): boolean {
    const basePath  = item.href.split('?')[0]
    const pathMatch = pathname === basePath || pathname.startsWith(basePath + '/')
    if (!pathMatch) return false

    if (item.statusParam) {
      return searchParams.get('status') === item.statusParam
    }
    // Plain /repairs item: only active when no status param is set
    if (basePath === '/repairs') {
      const s = searchParams.get('status')
      return !s || s === 'ALL'
    }
    return true
  }

  function getSections() {
    switch (role) {
      case 'TECHNICIAN':  return { primary: TECHNICIAN_SECTIONS }
      case 'CASHIER':     return { primary: CASHIER_SECTIONS }
      case 'STOCK_STAFF': return { primary: STOCK_STAFF_SECTIONS }
      case 'MANAGER':     return { primary: MANAGER_SECTIONS }
      default:            return { primary: OWNER_PRIMARY, secondary: OWNER_SECONDARY }
    }
  }

  const { primary, secondary } = getSections()

  function renderSection(section: NavSection, key: string | number) {
    const visible = section.items.filter(isVisible)
    if (visible.length === 0) return null
    return (
      <div key={key} className="mb-1">
        {section.label && (
          <div className="mx-3 mb-1 mt-3">
            <div className="h-px bg-slate-100 dark:bg-slate-700/60 mb-2" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none">
              {section.label}
            </p>
          </div>
        )}
        {visible.map((item) => {
          const active = isActive(item)
          const Icon   = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'relative flex items-center gap-3 mx-2 my-0.5 px-3 py-2.5 rounded-xl transition-all min-h-[44px]',
                active
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-slate-100',
              )}
            >
              <Icon className={cn('h-5 w-5 flex-shrink-0', active ? 'text-white' : 'text-slate-400 dark:text-slate-500')} />
              <span className={cn('text-sm font-medium truncate', active ? 'text-white' : 'text-slate-700 dark:text-slate-300')}>
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-3">
      {primary.map((s, i) => renderSection(s, i))}

      {secondary && (() => {
        const hasVisible = secondary.some(s => s.items.some(isVisible))
        if (!hasVisible) return null
        return (
          <div className="mx-3 mt-3">
            <div className="h-px bg-slate-100 dark:bg-slate-700/60 mb-1" />
            <button
              onClick={() => setOthersOpen(o => !o)}
              className="flex items-center justify-between w-full py-2 group"
            >
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 select-none group-hover:text-slate-600 dark:group-hover:text-slate-300 transition">
                อื่นๆ
              </p>
              {othersOpen
                ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                : <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
            </button>
            {othersOpen && secondary.map((s, i) => renderSection(s, `sec-${i}`))}
          </div>
        )
      })()}
    </nav>
  )
}

// ── Sidebar shell ─────────────────────────────────────────────────────────────

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user      = useAuthStore((s) => s.user)
  const hasPerm   = useAuthStore((s) => s.hasPermission)
  const hasModule = useAuthStore((s) => s.hasModule)
  const isOwner   = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const shopName  = useShopName()
  const portalLabel = PORTAL_LABEL[user?.role ?? ''] ?? 'Portal'

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside
        className={cn(
          'flex flex-col flex-shrink-0',
          'bg-white dark:bg-[#1E293B]',
          'border-r border-slate-200 dark:border-slate-700/60',
          'overflow-hidden',
          'hidden md:flex md:relative md:w-60',
          open && 'fixed inset-y-0 left-0 z-50 !flex !w-60 shadow-2xl',
        )}
      >
        {/* Logo bar */}
        <div className="flex h-14 items-center flex-shrink-0 px-3 border-b border-slate-100 overflow-hidden bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/20 shadow-sm backdrop-blur-sm border border-white/20">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div className="ml-3 min-w-0 flex-1 overflow-hidden">
            <p className="text-sm font-bold text-white truncate leading-none">{shopName}</p>
            <p className="text-[10px] text-blue-200 mt-0.5">{portalLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-2 flex-shrink-0 p-1.5 rounded-lg hover:bg-white/20 md:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="h-4 w-4 text-white/80" />
          </button>
        </div>

        {/* Navigation — wrapped in Suspense so useSearchParams works */}
        <Suspense fallback={<div className="flex-1" />}>
          <SidebarNav
            role={user?.role ?? ''}
            hasPerm={hasPerm}
            hasModule={hasModule}
            isOwner={isOwner}
          />
        </Suspense>

        {/* User info */}
        <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-700/60 p-3 overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 shadow-sm">
              <span className="text-xs font-bold text-white">
                {(user?.name ?? 'U').charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate leading-none">
                {user?.name}
              </p>
              <span className="inline-flex items-center mt-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-800 px-1.5 py-0.5 text-[9px] font-semibold">
                {portalLabel}
              </span>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
