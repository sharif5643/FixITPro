'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import {
  X, ChevronDown, ChevronRight, LayoutDashboard, Package, ShoppingCart, Wrench,
  Users, Clock, Smartphone, Tag, Barcode, Settings, CreditCard, Building2,
  ClipboardList, ShieldCheck, FileWarning, UserCog, ShieldAlert, AlertCircle,
  BookOpen, Receipt, TrendingUp, FileSpreadsheet, ScrollText, Bell, Database,
  BadgeCheck, BarChart2, FolderInput, GitBranch, ArrowRightLeft, CalendarDays, Wifi,
  ListChecks, Handshake, Wallet, Scale, BookMarked, ArrowUpDown, LineChart, Landmark,
  HardHat, History, ListOrdered, HandCoins, Coins, Star, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { useShopName, useShopLogo } from '@/hooks/useShopName'
import { useBranchContext } from '@/hooks/useBranchContext'
import { FiAvatar } from '@/components/fi/avatar'

// ── Types ──────────────────────────────────────────────────────────────────────

type NavItem = {
  href: string; icon: React.ElementType; label: string
  permission?: string | null; ownerOnly?: true; module?: string; statusParam?: string
}
/** `key` names the group for remembering open/closed; `open` is its default state. */
type NavSection = { key: string; label: string | null; open?: boolean; items: NavItem[] }

// ── Nav definitions ────────────────────────────────────────────────────────────
// OWNER and MANAGER share one menu; each item is shown only with its permission / module /
// owner-only rule, so a manager sees what their role allows.

const SHOP_SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' }] },
  { key: 'repair', label: 'งานซ่อม', open: true, items: [
    { href: '/repairs',         icon: Wrench,       label: 'งานซ่อม',        permission: 'repair.create',       module: 'repair' },
    { href: '/reminders',       icon: CalendarDays, label: 'นัดหมาย',        permission: 'repair.create',       module: 'repair' },
    { href: '/partner-repairs', icon: Handshake,    label: 'งานพาร์ทเนอร์',  permission: 'partner_repair.work', module: 'repair' },
    { href: '/warranties',      icon: BadgeCheck,   label: 'การรับประกัน',   permission: 'warranty.view',       module: 'repair' },
    { href: '/claims',          icon: FileWarning,  label: 'จัดการเคลม',     permission: 'claims.manage',       module: 'repair' },
  ]},
  { key: 'sales', label: 'การขาย', open: true, items: [
    { href: '/sales',            icon: ShoppingCart, label: 'ขายสินค้า (POS)',      permission: 'sales.create', module: 'pos' },
    { href: '/sales/history',    icon: ScrollText,   label: 'ประวัติการขาย',        permission: 'sales.create', module: 'pos' },
    { href: '/package-sales',    icon: Wifi,         label: 'ขายซิม / แพ็กเกจ',      module: 'package_sales' },
    { href: '/shifts',           icon: Clock,        label: 'เปิด/ปิดกะ' },
    { href: '/shifts/checklist', icon: ListChecks,   label: 'เช็กลิสต์เปิด/ปิดร้าน' },
  ]},
  { key: 'stock', label: 'สต็อก', open: true, items: [
    { href: '/products',        icon: Package,        label: 'สินค้า',           permission: 'products.view',   module: 'stock' },
    { href: '/transfers',       icon: ArrowRightLeft, label: 'โอนสต็อก',         permission: 'stock.transfer',  module: 'stock' },
    { href: '/purchase-orders', icon: ClipboardList,  label: 'ใบสั่งซื้อ (PO)',  permission: 'purchase.create', module: 'finance' },
    { href: '/suppliers',       icon: Building2,      label: 'ซัพพลายเออร์',     permission: 'purchase.create', module: 'finance' },
    { href: '/serials',         icon: ShieldCheck,    label: 'Serial / IMEI',    permission: 'serials.manage',  module: 'stock' },
    { href: '/categories',      icon: Tag,            label: 'หมวดหมู่',         permission: 'products.view',   module: 'stock' },
    { href: '/barcode-print',   icon: Barcode,        label: 'พิมพ์บาร์โค้ด',    permission: 'products.view',   module: 'stock' },
  ]},
  { key: 'customers', label: 'ลูกค้า', open: true, items: [
    { href: '/customers', icon: Users,       label: 'ลูกค้า',       module: 'crm' },
    { href: '/debt',      icon: AlertCircle, label: 'หนี้ค้างชำระ', ownerOnly: true, module: 'crm' },
  ]},
  { key: 'money', label: 'รายงานและการเงิน', open: true, items: [
    { href: '/reports/daily-closing', icon: BookOpen,    label: 'รายงานปิดวัน',        permission: 'reports.view',    module: 'report' },
    { href: '/reports/profit',        icon: TrendingUp,  label: 'รายงานกำไร',          permission: 'reports.view',    module: 'report' },
    { href: '/analytics',             icon: BarChart2,   label: 'วิเคราะห์เชิงลึก',    permission: 'reports.view',    module: 'report' },
    { href: '/finance',               icon: Wallet,      label: 'ภาพรวมการเงิน',       permission: 'reports.view',    module: 'finance' },
    { href: '/finance/transactions',  icon: ListOrdered, label: 'รายการรับ-จ่าย',       permission: 'reports.view',    module: 'finance' },
    { href: '/finance/daily-close',   icon: CalendarDays, label: 'ปิดบัญชีประจำวัน',   permission: 'reports.view',    module: 'finance' },
    { href: '/finance/branch-pnl',    icon: GitBranch,   label: 'กำไร-ขาดทุนรายสาขา',  permission: 'reports.view',    ownerOnly: true, module: 'finance' },
    { href: '/reconciliation',        icon: Scale,       label: 'กระทบยอดเงินสด',      permission: 'cash_drawer.view_balance', module: 'finance' },
    { href: '/expenses',              icon: Receipt,     label: 'ค่าใช้จ่าย',           permission: 'expenses.manage', module: 'finance' },
    { href: '/reports/payables',      icon: HandCoins,   label: 'รายงานเจ้าหนี้',      permission: 'reports.view',    module: 'finance' },
  ]},
  { key: 'accounting', label: 'บัญชี', open: false, items: [
    { href: '/accounting',                  icon: BookMarked,      label: 'สมุดบัญชี',      ownerOnly: true, module: 'accounting' },
    { href: '/accounting/income-statement', icon: TrendingUp,      label: 'งบกำไรขาดทุน',   ownerOnly: true, module: 'accounting' },
    { href: '/accounting/balance-sheet',    icon: Landmark,        label: 'งบดุล',          ownerOnly: true, module: 'accounting' },
    { href: '/accounting/trial-balance',    icon: FileSpreadsheet, label: 'งบทดลอง',        ownerOnly: true, module: 'accounting' },
    { href: '/accounting/cash-flow',        icon: ArrowUpDown,     label: 'งบกระแสเงินสด', ownerOnly: true, module: 'accounting' },
    { href: '/accounting/trends',           icon: LineChart,       label: 'แนวโน้มกำไร',    ownerOnly: true, module: 'accounting' },
    { href: '/accounting/accounts',         icon: BookOpen,        label: 'ผังบัญชี',       ownerOnly: true, module: 'accounting' },
  ]},
  { key: 'team', label: 'ทีมงาน', open: false, items: [
    { href: '/technicians', icon: HardHat,     label: 'ประสิทธิภาพช่าง', permission: 'technician.view' },
    { href: '/technicians/commission', icon: Coins,     label: 'ค่าคอมมิชชั่น', permission: 'reports.view' },
    { href: '/employees',   icon: UserCog,     label: 'พนักงาน',          ownerOnly: true, module: 'user_management' },
    { href: '/roles',       icon: ShieldAlert, label: 'สิทธิ์การใช้งาน', ownerOnly: true, module: 'user_management' },
    { href: '/branches',    icon: GitBranch,   label: 'สาขา',             permission: 'branches.manage', ownerOnly: true, module: 'user_management' },
  ]},
  { key: 'system', label: 'ระบบ', open: false, items: [
    { href: '/notifications', icon: Bell,        label: 'การแจ้งเตือน',     permission: 'notification.view' },
    { href: '/settings',      icon: Settings,    label: 'ตั้งค่า',          permission: 'settings.manage' },
    { href: '/data-tools',    icon: FolderInput, label: 'เครื่องมือข้อมูล', permission: 'data.export',   module: 'report' },
    { href: '/backup',        icon: Database,    label: 'สำรองข้อมูล',      permission: 'system.backup', ownerOnly: true, module: 'report' },
    { href: '/audit-logs',    icon: History,     label: 'ประวัติกิจกรรม',  permission: 'audit.view',    module: 'report' },
    { href: '/subscription',  icon: CreditCard,  label: 'แพ็กเกจ / ต่ออายุ', ownerOnly: true },
  ]},
]

const CASHIER_SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' }] },
  { key: 'sales', label: 'การขาย', open: true, items: [
    { href: '/sales',            icon: ShoppingCart, label: 'ขายสินค้า (POS)',      module: 'pos'           },
    { href: '/sales/history',    icon: ScrollText,   label: 'ประวัติการขาย',        module: 'pos'           },
    { href: '/package-sales',    icon: Wifi,         label: 'ขายซิม / แพ็กเกจ',      module: 'package_sales' },
    { href: '/shifts',           icon: Clock,        label: 'เปิด/ปิดกะ' },
    { href: '/shifts/checklist', icon: ListChecks,   label: 'เช็กลิสต์เปิด/ปิดร้าน' },
    { href: '/expenses',         icon: Receipt,      label: 'ค่าใช้จ่าย', permission: 'expenses.manage', module: 'finance' },
  ]},
  { key: 'repair', label: 'งานซ่อม', open: true, items: [{ href: '/repairs', icon: Wrench, label: 'รับชำระงานซ่อม', module: 'repair' }] },
  { key: 'customers', label: 'ลูกค้า', open: true, items: [
    { href: '/customers',     icon: Users, label: 'ลูกค้า',        module: 'crm' },
    { href: '/notifications', icon: Bell,  label: 'การแจ้งเตือน' },
  ]},
]

const TECHNICIAN_SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'งานของฉัน' }] },
  { key: 'repair', label: 'งานซ่อม', open: true, items: [
    { href: '/repairs',                      icon: Wrench,     label: 'งานซ่อมทั้งหมด', module: 'repair' },
    { href: '/repairs?status=WAITING_PARTS', icon: Package,    label: 'งานรออะไหล่',    module: 'repair', statusParam: 'WAITING_PARTS' },
    { href: '/repairs?status=QC_PENDING',    icon: BadgeCheck, label: 'งานรอ QC',       module: 'repair', statusParam: 'QC_PENDING' },
  ]},
  { key: 'other', label: null, items: [{ href: '/notifications', icon: Bell, label: 'การแจ้งเตือน' }] },
]

const STOCK_STAFF_SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' }] },
  { key: 'stock', label: 'สต็อก', open: true, items: [
    { href: '/products',      icon: Package,        label: 'สินค้าทั้งหมด',   permission: 'products.view',  module: 'stock' },
    { href: '/categories',    icon: Tag,            label: 'หมวดหมู่สินค้า',  permission: 'products.view',  module: 'stock' },
    { href: '/barcode-print', icon: Barcode,        label: 'พิมพ์บาร์โค้ด',   permission: 'products.view',  module: 'stock' },
    { href: '/transfers',     icon: ArrowRightLeft, label: 'โอนสต็อก',        permission: 'stock.transfer', module: 'stock' },
  ]},
  { key: 'purchase', label: 'จัดซื้อ', open: true, items: [
    { href: '/purchase-orders', icon: ClipboardList, label: 'รับสินค้าเข้า (PO)', permission: 'purchase.create', module: 'finance' },
    { href: '/suppliers',       icon: Building2,     label: 'ซัพพลายเออร์',        permission: 'purchase.create', module: 'finance' },
    { href: '/serials',         icon: ShieldCheck,   label: 'Serial / IMEI',        permission: 'serials.manage',  module: 'stock'  },
  ]},
  { key: 'other', label: null, items: [{ href: '/notifications', icon: Bell, label: 'การแจ้งเตือน' }] },
]

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'เจ้าของร้าน', SUPER_ADMIN: 'ผู้ดูแลระบบ', MANAGER: 'ผู้จัดการ',
  CASHIER: 'แคชเชียร์', TECHNICIAN: 'ช่างซ่อม', STOCK_STAFF: 'พนักงานสต็อก',
}

const MAX_PINS = 6

// localStorage can throw (private mode, blocked storage) — every access is best-effort.
function readJson<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback } catch { return fallback }
}
function writeJson(key: string, value: unknown) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* storage blocked */ }
}

// ── Inner nav (uses useSearchParams — must be in Suspense) ─────────────────────

interface SideNavInnerProps {
  role: string
  userId: string
  hasPerm: (p: string) => boolean
  hasModule: (m: string) => boolean
  isOwner: boolean
  collapsed: boolean
}

function SideNavInner({ role, userId, hasPerm, hasModule, isOwner, collapsed }: SideNavInnerProps) {
  const pathname     = usePathname()
  const searchParams = useSearchParams()
  const canPin       = role === 'OWNER' || role === 'MANAGER' || role === 'SUPER_ADMIN'
  const pinsKey      = `fi-nav-pins:${userId}`

  const sections = useMemo(() => {
    switch (role) {
      case 'TECHNICIAN':  return TECHNICIAN_SECTIONS
      case 'CASHIER':     return CASHIER_SECTIONS
      case 'STOCK_STAFF': return STOCK_STAFF_SECTIONS
      default:            return SHOP_SECTIONS
    }
  }, [role])

  function isVisible(item: NavItem): boolean {
    if (item.ownerOnly && !isOwner) return false
    if (item.permission && !hasPerm(item.permission)) return false
    if (item.module && !hasModule(item.module)) return false
    return true
  }
  function pathMatches(item: NavItem): boolean {
    const basePath = item.href.split('?')[0]
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  const allVisible = sections.flatMap((s) => s.items.filter(isVisible))
  // Only the most specific match is active: on /sales/history, "ประวัติการขาย" lights up, not POS too.
  const longestMatch = allVisible.filter(pathMatches).reduce((len, i) => Math.max(len, i.href.split('?')[0].length), 0)
  function isActive(item: NavItem): boolean {
    const basePath = item.href.split('?')[0]
    if (!pathMatches(item) || basePath.length !== longestMatch) return false
    if (item.statusParam) return searchParams.get('status') === item.statusParam
    if (basePath === '/repairs') { const s = searchParams.get('status'); return !s || s === 'ALL' }
    return true
  }

  // Remembered open/closed groups. The user's choice always wins, even for the group holding the
  // current page (a closed group shows a dot instead).
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({})
  const [pins, setPins] = useState<string[]>([])
  useEffect(() => {
    setOpenGroups(readJson('fi-nav-groups', {}))
    setPins(readJson(pinsKey, []))
  }, [pinsKey])
  function isOpen(section: NavSection) {
    if (!section.label) return true
    return openGroups[section.key] ?? section.open ?? true
  }
  function toggleGroup(section: NavSection) {
    const next = { ...openGroups, [section.key]: !isOpen(section) }
    setOpenGroups(next)
    writeJson('fi-nav-groups', next)
  }
  function togglePin(href: string) {
    const next = pins.includes(href) ? pins.filter((p) => p !== href) : [...pins, href].slice(-MAX_PINS)
    setPins(next)
    writeJson(pinsKey, next)
  }

  const pinnedItems = canPin
    ? pins.map((href) => allVisible.find((i) => i.href === href)).filter((i): i is NavItem => !!i)
    : []

  function renderItem(item: NavItem, keyPrefix = '') {
    const active = isActive(item)
    const Icon   = item.icon
    const pinned = pins.includes(item.href)
    return (
      <div key={keyPrefix + item.href} className="relative group/item">
        <Link
          href={item.href}
          title={collapsed ? item.label : undefined}
          className={cn(
            'flex items-center gap-3 rounded-xl transition-all duration-100 min-h-[40px] group',
            collapsed ? 'justify-center px-0 py-2.5' : 'px-3 py-2.5',
            active
              ? 'bg-[rgb(var(--brand))] text-[rgb(var(--brand-fg))] shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700/40 hover:text-slate-900 dark:hover:text-white',
          )}
        >
          <Icon className={cn(
            'h-4 w-4 flex-shrink-0 transition-colors',
            active ? 'text-[rgb(var(--brand-fg))]' : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-700 dark:group-hover:text-slate-300',
          )} />
          {!collapsed && (
            <span className={cn('text-sm font-medium truncate pr-5', active ? 'text-[rgb(var(--brand-fg))]' : 'text-slate-700 dark:text-slate-300')}>
              {item.label}
            </span>
          )}
        </Link>
        {canPin && !collapsed && item.href !== '/dashboard' && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
            aria-label={pinned ? `เอา ${item.label} ออกจากเมนูใช้บ่อย` : `ปักหมุด ${item.label} ไว้ที่เมนูใช้บ่อย`}
            title={pinned ? 'เอาออกจากเมนูใช้บ่อย' : 'ปักหมุดไว้ที่เมนูใช้บ่อย'}
            className={cn(
              'absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 flex items-center justify-center rounded-md transition-opacity',
              pinned ? 'opacity-100' : 'opacity-0 group-hover/item:opacity-100 focus:opacity-100',
              active ? 'text-[rgb(var(--brand-fg)/0.8)] hover:text-[rgb(var(--brand-fg))]' : 'text-slate-300 hover:text-amber-500',
            )}
          >
            <Star className={cn('h-3.5 w-3.5', pinned && !active && 'fill-amber-400 text-amber-400', pinned && active && 'fill-white')} />
          </button>
        )}
      </div>
    )
  }

  function renderSection(section: NavSection) {
    const visible = section.items.filter(isVisible)
    if (visible.length === 0) return null
    const open = isOpen(section)
    const holdsActive = !open && visible.some(isActive)
    return (
      <div key={section.key} className="mb-0.5">
        {section.label && !collapsed && (
          <button
            type="button"
            onClick={() => toggleGroup(section)}
            aria-expanded={open}
            className="mx-3 mt-4 mb-1 flex w-[calc(100%-1.5rem)] items-center justify-between rounded-lg px-1 py-0.5 hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400 select-none">
              {section.label}
              {holdsActive && <span className="h-1.5 w-1.5 rounded-full bg-[rgb(var(--brand))]" aria-label="หน้าปัจจุบันอยู่ในกลุ่มนี้" />}
            </span>
            {open
              ? <ChevronDown  className="h-3.5 w-3.5 text-slate-400" />
              : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </button>
        )}
        {section.label && collapsed && <div className="mx-3 my-2 border-t border-slate-100 dark:border-slate-700/60" />}
        {(open || collapsed) && (
          <div className="px-2 space-y-0.5">{visible.map((item) => renderItem(item))}</div>
        )}
      </div>
    )
  }

  return (
    <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none py-2">
      {renderSection(sections[0])}
      {pinnedItems.length > 0 && (
        <div className="mb-0.5">
          {!collapsed && (
            <p className="mx-4 mt-4 mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 select-none">
              <Star className="h-3 w-3 fill-current" />ใช้บ่อย
            </p>
          )}
          {collapsed && <div className="mx-3 my-2 border-t border-slate-100 dark:border-slate-700/60" />}
          <div className="px-2 space-y-0.5">{pinnedItems.map((item) => renderItem(item, 'pin-'))}</div>
        </div>
      )}
      {sections.slice(1).map(renderSection)}
    </nav>
  )
}

// ── SideNav shell ──────────────────────────────────────────────────────────────

export function SideNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user        = useAuthStore((s) => s.user)
  const hasPerm     = useAuthStore((s) => s.hasPermission)
  const hasModule   = useAuthStore((s) => s.hasModule)
  const isOwner     = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const shopName    = useShopName()
  const shopLogo    = useShopLogo()
  const { branchName } = useBranchContext()
  const roleLabel   = ROLE_LABEL[user?.role ?? ''] ?? ''
  const pathname    = usePathname()

  // Desktop only: icon-only mode. POS starts collapsed to give the till more room; toggling
  // there only lasts until the page changes, elsewhere the choice is remembered.
  const isPos = pathname === '/sales'
  const [collapsedPref, setCollapsedPref] = useState(false)
  const [posOverride, setPosOverride] = useState<boolean | null>(null)
  useEffect(() => { setCollapsedPref(readJson('fi-nav-collapsed', false)) }, [])
  useEffect(() => { setPosOverride(null) }, [pathname])
  const collapsed = !open && (posOverride ?? (isPos || collapsedPref))
  function toggleCollapsed() {
    if (isPos) { setPosOverride(!collapsed); return }
    setCollapsedPref(!collapsed)
    writeJson('fi-nav-collapsed', !collapsed)
  }

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[55] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={onClose}
          aria-hidden
        />
      )}

      <aside className={cn(
        'app-side flex flex-col flex-shrink-0 h-full',
        'bg-white dark:bg-[#111827]',
        'border-r border-slate-200 dark:border-slate-700/60',
        'overflow-hidden transition-[width] duration-150',
        'hidden md:flex md:relative',
        collapsed ? 'md:w-16' : 'md:w-60',
        open && 'fixed inset-y-0 left-0 z-[60] !flex !w-64 shadow-2xl',
      )}>
        {/* Shop + branch */}
        <div className={cn(
          'flex h-16 items-center flex-shrink-0 gap-3 [background:var(--brand-gradient)] text-white',
          collapsed ? 'justify-center px-2' : 'px-4',
        )}>
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/20 shadow-sm border border-white/25 backdrop-blur-sm" title={collapsed ? shopName : undefined}>
            {shopLogo
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={shopLogo} alt="" className="h-full w-full bg-white object-contain" />
              : <Smartphone className="h-4.5 w-4.5" />}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold truncate leading-none">{shopName}</p>
              <p className="text-[11px] opacity-80 mt-1 font-medium truncate flex items-center gap-1">
                <Building2 className="h-3 w-3 shrink-0" />{branchName || roleLabel}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors md:hidden"
            aria-label="ปิดเมนู"
          >
            <X className="h-4 w-4 opacity-80" />
          </button>
        </div>

        {/* Nav */}
        <Suspense fallback={<div className="flex-1" />}>
          <SideNavInner
            role={user?.role ?? ''}
            userId={user?.id ?? ''}
            hasPerm={hasPerm}
            hasModule={hasModule}
            isOwner={isOwner}
            collapsed={collapsed}
          />
        </Suspense>

        {/* User + collapse */}
        <div className="flex-shrink-0 border-t border-slate-100 dark:border-slate-700/60 p-2">
          <div className={cn('flex items-center gap-2', collapsed && 'flex-col')}>
            <div className={cn('flex items-center gap-3 rounded-xl px-2 py-2 min-w-0', !collapsed && 'flex-1')} title={collapsed ? user?.name : undefined}>
              <FiAvatar name={user?.name ?? 'U'} size="sm" status="online" />
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white truncate leading-none">{user?.name}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5 truncate">{roleLabel}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden md:flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700/40 dark:hover:text-slate-200"
              aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </aside>
    </>
  )
}
