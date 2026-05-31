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
}

type NavSection = {
  label: string | null  // null = no section header (used for top-level items)
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    label: null,
    items: [
      { href: '/', icon: LayoutDashboard, label: 'แดชบอร์ด', permission: null },
    ],
  },
  {
    label: 'การขาย',
    items: [
      { href: '/sales',    icon: ShoppingCart, label: 'ขายสินค้า (POS)', permission: 'sales.create' },
      { href: '/repairs',  icon: Wrench,       label: 'งานซ่อม',          permission: 'repair.create' },
      { href: '/shifts',   icon: Clock,        label: 'เปิด/ปิดกะ',       permission: null },
      { href: '/expenses', icon: Receipt,      label: 'ค่าใช้จ่าย',        permission: 'expenses.manage' },
    ],
  },
  {
    label: 'สินค้า',
    items: [
      { href: '/products',      icon: Package,         label: 'สินค้า',           permission: 'products.view' },
      { href: '/categories',    icon: Tag,             label: 'หมวดหมู่สินค้า',   permission: 'products.view' },
      { href: '/barcode-print', icon: Barcode,         label: 'พิมพ์ Barcode',    permission: 'products.view' },
      { href: '/transfers',     icon: ArrowRightLeft,  label: 'โอนสต๊อก',         permission: 'stock.transfer' },
    ],
  },
  {
    label: 'ลูกค้า',
    items: [
      { href: '/customers', icon: Users,        label: 'ลูกค้า',          permission: null },
      { href: '/debt',      icon: AlertCircle,  label: 'หนี้ค้างชำระ',    permission: null, ownerOnly: true },
    ],
  },
  {
    label: 'รายงาน',
    items: [
      { href: '/reports/daily-closing', icon: BookOpen,   label: 'รายงานปิดวัน', permission: 'reports.view' },
      { href: '/reports/profit',        icon: TrendingUp, label: 'รายงานกำไร',   permission: 'reports.view' },
    ],
  },
  {
    label: 'การจัดซื้อ',
    items: [
      { href: '/suppliers',        icon: Building2,       label: 'ซัพพลายเออร์',     permission: 'purchase.create' },
      { href: '/purchase-orders', icon: ClipboardList,   label: 'ใบสั่งซื้อ (PO)', permission: 'purchase.create' },
      { href: '/reports/payables', icon: FileSpreadsheet, label: 'รายงานเจ้าหนี้',  permission: 'reports.view' },
    ],
  },
  {
    label: 'จัดการ',
    items: [
      { href: '/serials',      icon: ShieldCheck,  label: 'Serial / IMEI',    permission: 'serials.manage' },
      { href: '/claims',       icon: FileWarning,  label: 'จัดการเคลม',       permission: 'claims.manage' },
      { href: '/warranties',   icon: BadgeCheck,   label: 'การรับประกัน',     permission: 'warranty.view' },
      { href: '/technicians',  icon: BarChart2,    label: 'ประสิทธิภาพช่าง',   permission: 'technician.view' },
      { href: '/employees',    icon: UserCog,     label: 'พนักงาน',           permission: null, ownerOnly: true },
      { href: '/roles',        icon: ShieldAlert, label: 'สิทธิ์การใช้งาน',  permission: null, ownerOnly: true },
      { href: '/branches',      icon: GitBranch,   label: 'สาขา',             permission: 'branches.manage', ownerOnly: true },
      { href: '/data-tools',    icon: FolderInput, label: 'เครื่องมือข้อมูล',  permission: 'data.export' },
      { href: '/notifications', icon: Bell,        label: 'การแจ้งเตือน',      permission: 'notification.view' },
      { href: '/backup',        icon: Database,    label: 'Backup ข้อมูล',     permission: 'system.backup', ownerOnly: true },
      { href: '/audit-logs',   icon: ScrollText,  label: 'ประวัติกิจกรรม',   permission: 'audit.view' },
      { href: '/settings',     icon: Settings,    label: 'ตั้งค่า',           permission: 'settings.manage' },
      { href: '/subscription', icon: CreditCard,  label: 'Subscription',     permission: null, ownerOnly: true },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

interface SidebarProps {
  open: boolean
  onClose: () => void
}

export function Sidebar({ open, onClose }: SidebarProps) {
  const pathname  = usePathname()
  const user      = useAuthStore((s) => s.user)
  const hasPerm   = useAuthStore((s) => s.hasPermission)
  const isOwner   = user?.role === 'OWNER'

  const { data: shopSettings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 10 * 60 * 1000,
  })

  function isVisible(item: NavItem): boolean {
    if (item.ownerOnly && !isOwner) return false
    if (item.permission && !hasPerm(item.permission)) return false
    return true
  }

  function isActive(href: string): boolean {
    return href === '/' ? pathname === '/' : pathname.startsWith(href)
  }

  const visibleSections = navSections
    .map((section) => ({ ...section, items: section.items.filter(isVisible) }))
    .filter((section) => section.items.length > 0)

  const navContent = (
    <>
      {/* Shop branding */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-700/60 px-5 flex-shrink-0">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-xl shrink-0 overflow-hidden',
          shopSettings?.logoUrl ? 'bg-white p-0.5' : 'bg-blue-600',
        )}>
          {shopSettings?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shopSettings.logoUrl}
              alt="logo"
              className="h-full w-full object-contain"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
            />
          ) : (
            <Smartphone className="h-5 w-5 text-white" />
          )}
        </div>
        <div className="leading-tight flex-1 min-w-0">
          <p className="font-bold text-base truncate">
            {shopSettings?.shopName ?? 'FixITPro'}
          </p>
          <p className="text-[11px] text-slate-400 truncate">
            {shopSettings?.shopSubtitle ?? 'ระบบร้านมือถือ'}
          </p>
        </div>
        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="md:hidden p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
          aria-label="ปิดเมนู"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3">
        {visibleSections.map((section, sectionIdx) => (
          <div key={sectionIdx} className={sectionIdx > 0 ? 'mt-1' : ''}>
            {section.label && (
              <p className="px-5 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-slate-500 select-none">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5 px-2">
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                    isActive(item.href)
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white',
                  )}
                >
                  <item.icon className="flex-shrink-0" style={{ width: 18, height: 18 }} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-slate-700/60 px-4 py-3 flex-shrink-0">
        <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">v0.1.0 MVP</p>
      </div>
    </>
  )

  return (
    <>
      {/* Mobile overlay backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — desktop: always visible; mobile: drawer */}
      <div
        className={cn(
          'flex h-full w-60 flex-col bg-slate-900 text-white flex-shrink-0 transition-transform duration-300',
          // Desktop: always in flow
          'md:relative md:translate-x-0',
          // Mobile: fixed drawer
          'fixed inset-y-0 left-0 z-50 md:static',
          open ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        {navContent}
      </div>
    </>
  )
}
