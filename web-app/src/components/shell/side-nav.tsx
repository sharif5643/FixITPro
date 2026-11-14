'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import {
  X, ChevronDown, ChevronRight, LayoutDashboard, Package, ShoppingCart, Wrench,
  Users, Clock, Smartphone, Tag, Barcode, Settings, CreditCard, Building2,
  ClipboardList, ShieldCheck, FileWarning, UserCog, ShieldAlert, AlertCircle,
  BookOpen, Receipt, TrendingUp, FileSpreadsheet, ScrollText, Bell, Database,
  BadgeCheck, Calculator, BarChart2, FolderInput, GitBranch, ArrowRightLeft, CalendarDays, Wifi,
  ListChecks, Handshake, UserPlus, Wallet, Scale, BookMarked, ArrowUpDown, LineChart, Landmark,
  HardHat, History, ListOrdered, HandCoins, Coins, Star, PanelLeftClose, PanelLeftOpen, Hammer, Crown,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useShopName, useShopLogo } from '@/hooks/useShopName'
import { useBranchContext } from '@/hooks/useBranchContext'
import { FiAvatar } from '@/components/fi/avatar'

// ── Types ──────────────────────────────────────────────────────────────────────

type NavItem = {
  href: string; icon: React.ElementType; label: string
  permission?: string | null; ownerOnly?: true; module?: string; statusParam?: string
  /** only for people who do repair work beside their role (permission repair.technician) */
  repairWork?: true
  /** only means something with more than one branch */
  multiBranch?: true
}
/** `key` names the group for remembering open/closed; `open` is its default state. */
type NavSection = { key: string; label: string | null; open?: boolean; items: NavItem[] }

// ── Nav definitions ────────────────────────────────────────────────────────────
// OWNER and MANAGER share one menu; each item is shown only with its permission / module /
// owner-only rule, so a manager sees what their role allows.

const SHOP_SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [
    { href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' },
    { href: '/owner', icon: Crown, label: 'ห้องเจ้าของร้าน', ownerOnly: true, module: 'owner_hub' },
    { href: '/repairs/mine', icon: Hammer, label: 'งานซ่อมของฉัน', module: 'repair', repairWork: true },
  ] },
  { key: 'repair', label: 'งานซ่อม', open: true, items: [
    { href: '/repairs',         icon: Wrench,       label: 'งานซ่อม',        permission: 'repair.create',       module: 'repair' },
    { href: '/reminders',       icon: CalendarDays, label: 'นัดหมาย',        permission: 'repair.create',       module: 'repair' },
    { href: '/repair-prices',   icon: Calculator,   label: 'ตารางราคาซ่อม',  permission: 'repair.create',       module: 'repair' },
    { href: '/partner-repairs', icon: Handshake,    label: 'งานพาร์ทเนอร์',  permission: 'partner_repair.work', module: 'repair' },
    { href: '/settings/partners', icon: UserPlus,   label: 'ร้านพาร์ทเนอร์',  ownerOnly: true,                   module: 'repair' },
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
    { href: '/transfers',       icon: ArrowRightLeft, label: 'โอนสต็อก',         permission: 'stock.transfer',  module: 'stock', multiBranch: true },
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
    { href: '/finance/branch-pnl',    icon: GitBranch,   label: 'กำไร-ขาดทุนรายสาขา',  permission: 'reports.view',    ownerOnly: true, module: 'finance', multiBranch: true },
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
  { key: 'home', label: null, items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' }, { href: '/repairs/mine', icon: Hammer, label: 'งานซ่อมของฉัน', module: 'repair', repairWork: true }] },
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
    { href: '/repair-prices',                icon: Calculator, label: 'เช็คราคาซ่อม',   module: 'repair' },
    { href: '/repairs?status=WAITING_PARTS', icon: Package,    label: 'งานรออะไหล่',    module: 'repair', statusParam: 'WAITING_PARTS' },
    { href: '/repairs?status=QC_PENDING',    icon: BadgeCheck, label: 'งานรอ QC',       module: 'repair', statusParam: 'QC_PENDING' },
  ]},
  { key: 'other', label: null, items: [{ href: '/notifications', icon: Bell, label: 'การแจ้งเตือน' }] },
]

const STOCK_STAFF_SECTIONS: NavSection[] = [
  { key: 'home', label: null, items: [{ href: '/dashboard', icon: LayoutDashboard, label: 'หน้าแรก' }, { href: '/repairs/mine', icon: Hammer, label: 'งานซ่อมของฉัน', module: 'repair', repairWork: true }] },
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


// ── Groups on the icon rail ──────────────────────────────────────────────────

/** Icon, short rail label and the line under the panel title, per group key */
const GROUP_META: Record<string, { icon: React.ElementType; short: string; title: string; sub: string }> = {
  home:       { icon: LayoutDashboard, short: 'หน้าแรก', title: 'หน้าแรก',          sub: 'ภาพรวมของร้าน' },
  repair:     { icon: Wrench,          short: 'ซ่อม',    title: 'งานซ่อม',          sub: 'รับเครื่อง ติดตามงาน เคลม' },
  sales:      { icon: ShoppingCart,    short: 'ขาย',     title: 'การขาย',           sub: 'ขายหน้าร้าน ซิม และกะ' },
  stock:      { icon: Package,         short: 'สต็อก',   title: 'สต็อก',            sub: 'สินค้า โอน และสั่งซื้อ' },
  purchase:   { icon: ClipboardList,   short: 'จัดซื้อ',  title: 'จัดซื้อ',           sub: 'รับสินค้าเข้าและซัพพลายเออร์' },
  customers:  { icon: Users,           short: 'ลูกค้า',  title: 'ลูกค้า',            sub: 'ลูกค้าและหนี้ค้างชำระ' },
  money:      { icon: Wallet,          short: 'เงิน',    title: 'รายงานและการเงิน', sub: 'ปิดวัน กำไร ค่าใช้จ่าย' },
  accounting: { icon: BookMarked,      short: 'บัญชี',   title: 'บัญชี',             sub: 'สมุดบัญชีและงบการเงิน' },
  team:       { icon: UserCog,         short: 'ทีม',     title: 'ทีมงาน',           sub: 'พนักงาน สิทธิ์ และสาขา' },
  system:     { icon: Settings,        short: 'ระบบ',    title: 'ระบบ',             sub: 'ตั้งค่าและข้อมูล' },
  other:      { icon: Bell,            short: 'แจ้งเตือน', title: 'แจ้งเตือน',        sub: 'ข่าวจากระบบ' },
}
const PINS = 'pins'

// ── Inner nav (uses useSearchParams — must be in Suspense) ─────────────────────

interface SideNavInnerProps {
  role: string
  userId: string
  hasPerm: (p: string) => boolean
  hasModule: (m: string) => boolean
  isOwner: boolean
  collapsed: boolean
  /** a rail group was tapped while only the rail shows: open the panel */
  onExpand: () => void
  onClose: () => void
  shopName: string
  shopLogo: string | null | undefined
  branchName: string
  userName: string
  roleLabel: string
  onToggleCollapsed: () => void
  mobile: boolean
}

/**
 * The menu in two parts: a rail of groups (theme colour) and a panel with the group's pages.
 * ⭐ ใช้บ่อย on the rail holds the pages the user pinned; a star on any page pins it.
 * Colours follow the shop's theme set (the blue scale is the theme's main colour) and dark mode.
 */
function SideNavInner(p: SideNavInnerProps) {
  const { role, userId, hasPerm, hasModule, isOwner, collapsed } = p
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

  // A shop with one branch does not need branch-to-branch menus (fewer items for a new shop)
  const { data: branchList } = useQuery<{ id: string }[]>({
    queryKey: ['branches-simple'],
    queryFn:  () => api.get('/branches').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled:  role !== 'SUPER_ADMIN',
  })
  const singleBranch = Array.isArray(branchList) && branchList.length <= 1

  function isVisible(item: NavItem): boolean {
    if (item.multiBranch && singleBranch) return false
    if (item.ownerOnly && !isOwner) return false
    // Owners see every job anyway; others get "my jobs" when the owner made them a technician
    if (item.repairWork && (role === 'OWNER' || role === 'SUPER_ADMIN' || role === 'TECHNICIAN' || !hasPerm('repair.technician'))) return false
    if (item.permission && !hasPerm(item.permission)) return false
    if (item.module && !hasModule(item.module)) return false
    return true
  }
  function pathMatches(item: NavItem): boolean {
    const basePath = item.href.split('?')[0]
    return pathname === basePath || pathname.startsWith(basePath + '/')
  }

  const groups = sections
    .map((s) => ({ ...s, visible: s.items.filter(isVisible) }))
    .filter((s) => s.visible.length > 0)
  const allVisible = groups.flatMap((g) => g.visible)
  // Only the most specific match is active: on /sales/history, "ประวัติการขาย" lights up, not POS too.
  const longestMatch = allVisible.filter(pathMatches).reduce((len, i) => Math.max(len, i.href.split('?')[0].length), 0)
  function isActive(item: NavItem): boolean {
    const basePath = item.href.split('?')[0]
    if (!pathMatches(item) || basePath.length !== longestMatch) return false
    if (item.statusParam) return searchParams.get('status') === item.statusParam
    if (basePath === '/repairs') { const s = searchParams.get('status'); return !s || s === 'ALL' }
    return true
  }
  const pageGroup = groups.find((g) => g.visible.some(isActive))?.key

  const [pins, setPins] = useState<string[]>([])
  useEffect(() => { setPins(readJson(pinsKey, [])) }, [pinsKey])
  function togglePin(href: string) {
    const next = pins.includes(href) ? pins.filter((x) => x !== href) : [...pins, href].slice(-MAX_PINS)
    setPins(next)
    writeJson(pinsKey, next)
  }
  const pinnedItems = canPin
    ? pins.map((href) => allVisible.find((i) => i.href === href)).filter((i): i is NavItem => !!i)
    : []
  const groupOf = (href: string) => groups.find((g) => g.visible.some((i) => i.href === href))

  // The panel shows the group of the current page, until another group is picked
  const [picked, setPicked] = useState<string | null>(null)
  useEffect(() => { setPicked(null) }, [pathname])
  const current = picked ?? pageGroup ?? (pinnedItems.length ? PINS : groups[0]?.key)
  const currentGroup = groups.find((g) => g.key === current)

  function pick(key: string) {
    setPicked(key)
    if (collapsed) p.onExpand()
  }

  // ── rail ──
  function RailButton({ k, icon: Icon, label, dot }: { k: string; icon: React.ElementType; label: string; dot?: boolean }) {
    // With the panel shut, the rail marks the group of the page being shown
    const on = collapsed ? k === pageGroup : current === k
    const single = k !== PINS ? groups.find((g) => g.key === k)?.visible : null
    const cls = cn(
      'relative flex w-[60px] flex-col items-center gap-0.5 rounded-2xl py-2 transition-colors',
      on
        ? 'bg-white text-blue-700 shadow-md shadow-black/15 dark:bg-blue-500/35 dark:text-white dark:shadow-none'
        : 'text-[rgb(var(--brand-header-fg))] opacity-90 hover:bg-white/15 hover:opacity-100',
    )
    const inner = (
      <>
        {k === PINS ? <Star className={cn('h-5 w-5', 'fill-amber-400 text-amber-400')} /> : <Icon className="h-5 w-5" />}
        <span className="max-w-full truncate px-0.5 text-[11.5px] font-medium leading-tight">{label}</span>
        {dot && <span className="absolute right-2 top-1.5 h-2 w-2 rounded-full bg-white ring-2 ring-blue-600 dark:ring-blue-900" aria-label="หน้าปัจจุบันอยู่ในกลุ่มนี้" />}
      </>
    )
    // A group of one page goes straight to it
    if (single && single.length === 1) {
      const it = single[0]
      return <Link href={it.href} title={it.label} aria-current={isActive(it) ? 'page' : undefined} className={cn(cls, isActive(it) && 'bg-white text-blue-700 shadow-md shadow-black/15 opacity-100 dark:bg-blue-500/35 dark:text-white dark:shadow-none')}>{inner}</Link>
    }
    return <button type="button" onClick={() => pick(k)} title={label} aria-pressed={on} className={cls}>{inner}</button>
  }

  // ── panel rows ──
  function Row({ item, from }: { item: NavItem; from?: string }) {
    const active = isActive(item)
    const pinned = pins.includes(item.href)
    const Icon = item.icon
    return (
      <div className="group/item relative">
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex min-h-[46px] items-center gap-3 rounded-xl py-2 pl-3 transition-colors',
            canPin ? 'pr-10' : 'pr-3',
            active
              ? 'bg-blue-600/[0.12] text-blue-700 shadow-[inset_3px_0_0_rgb(var(--blue-600))] dark:bg-blue-400/15 dark:text-blue-200'
              : 'text-slate-700 hover:bg-blue-600/[0.06] dark:text-slate-300 dark:hover:bg-white/5',
          )}
        >
          <Icon className={cn('h-[19px] w-[19px] shrink-0', active ? 'text-blue-600 dark:text-blue-300' : 'text-slate-400 dark:text-slate-500')} />
          <span className="min-w-0 flex-1">
            <span className={cn('block truncate text-[15px] leading-snug', active ? 'font-semibold' : 'font-medium')}>{item.label}</span>
            {from && <span className="block truncate text-[11.5px] text-slate-400">{from}</span>}
          </span>
        </Link>
        {canPin && item.href !== '/dashboard' && (
          <button
            type="button"
            onClick={() => togglePin(item.href)}
            aria-label={pinned ? `เอา ${item.label} ออกจากเมนูใช้บ่อย` : `ปักหมุด ${item.label} ไว้ที่เมนูใช้บ่อย`}
            title={pinned ? 'เอาออกจากเมนูใช้บ่อย' : 'ปักหมุดไว้ที่เมนูใช้บ่อย'}
            className={cn(
              'absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg transition-opacity hover:bg-black/5 dark:hover:bg-white/10',
              pinned ? 'opacity-100' : 'opacity-40 group-hover/item:opacity-100 focus:opacity-100',
            )}
          >
            <Star className={cn('h-[17px] w-[17px]', pinned ? 'fill-amber-400 text-amber-400' : 'text-slate-400')} />
          </button>
        )}
      </div>
    )
  }

  const meta = current === PINS
    ? { title: 'ใช้บ่อย', sub: 'เมนูที่คุณปักหมุดไว้' }
    : { title: currentGroup?.label ?? GROUP_META[current ?? '']?.title ?? '', sub: GROUP_META[current ?? '']?.sub ?? '' }

  return (
    <div className="flex min-h-0 flex-1">
      {/* Rail */}
      <div className={cn(
        'flex w-[76px] shrink-0 flex-col items-center gap-1 py-3',
        'bg-gradient-to-b from-blue-600 to-blue-800 dark:from-blue-950 dark:to-slate-950',
      )}>
        <div className="mb-2 flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/20 text-[rgb(var(--brand-header-fg))] ring-1 ring-white/25" title={p.shopName}>
          {p.shopLogo
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={p.shopLogo} alt="" className="h-full w-full bg-white object-contain" />
            : <Smartphone className="h-5 w-5" />}
        </div>
        <div className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto scrollbar-none">
          {canPin && <RailButton k={PINS} icon={Star} label="ใช้บ่อย" />}
          {groups.map((g) => {
            const m = GROUP_META[g.key] ?? { icon: LayoutDashboard, short: g.label ?? '' }
            return <RailButton key={g.key} k={g.key} icon={m.icon} label={m.short} dot={g.key === pageGroup && current !== g.key && !collapsed} />
          })}
        </div>
        <div className="mt-1 flex flex-col items-center gap-1.5" title={`${p.userName} · ${p.roleLabel}`}>
          <FiAvatar name={p.userName || 'U'} size="sm" status="online" />
          {!p.mobile && (
            <button
              type="button"
              onClick={p.onToggleCollapsed}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[rgb(var(--brand-header-fg))] opacity-80 hover:bg-white/15 hover:opacity-100"
              aria-label={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
              title={collapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
            >
              {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Panel */}
      {!collapsed && (
        <div className="flex min-w-0 flex-1 flex-col bg-blue-50/50 dark:bg-[#111827]">
          <div className="flex items-start gap-2 px-4 pb-2 pt-4">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-bold text-slate-900 dark:text-white">{p.shopName}</p>
              <p className="flex items-center gap-1 truncate text-[12.5px] text-slate-500 dark:text-slate-400">
                <Building2 className="h-3.5 w-3.5 shrink-0" />{p.branchName || p.roleLabel}
              </p>
            </div>
            {p.mobile && (
              <button type="button" onClick={p.onClose} aria-label="ปิดเมนู"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-black/5 dark:hover:bg-white/10">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
          <div className="mx-4 border-t border-blue-600/10 dark:border-white/10" />
          <div className="px-4 pb-2 pt-3">
            <p className="flex items-center gap-1.5 text-[19px] font-bold leading-tight text-slate-900 dark:text-white">
              {current === PINS && <Star className="h-[18px] w-[18px] fill-amber-400 text-amber-400" />}{meta.title}
            </p>
            {meta.sub && <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{meta.sub}</p>}
          </div>
          <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-3 scrollbar-none">
            {current === PINS ? (
              pinnedItems.length ? (
                pinnedItems.map((item) => <Row key={'pin-' + item.href} item={item} from={groupOf(item.href)?.label ?? GROUP_META[groupOf(item.href)?.key ?? '']?.title} />)
              ) : (
                <p className="px-3 py-4 text-[13.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                  ยังไม่มีเมนูที่ปักหมุด กด <Star className="inline h-3.5 w-3.5 -translate-y-px text-slate-400" /> ข้างเมนูไหนก็ได้ เพื่อเพิ่มมาไว้ตรงนี้
                </p>
              )
            ) : (
              currentGroup?.visible.map((item) => <Row key={item.href} item={item} />)
            )}
          </nav>
          <div className="border-t border-blue-600/10 px-4 py-3 dark:border-white/10">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{p.userName}</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{p.roleLabel}</p>
          </div>
        </div>
      )}
    </div>
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

  // Desktop only: rail-only mode. POS starts that way to give the till more room; toggling
  // there only lasts until the page changes, elsewhere the choice is remembered.
  const isPos = pathname === '/sales'
  const [collapsedPref, setCollapsedPref] = useState(false)
  const [posOverride, setPosOverride] = useState<boolean | null>(null)
  useEffect(() => { setCollapsedPref(readJson('fi-nav-collapsed', false)) }, [])
  useEffect(() => { setPosOverride(null) }, [pathname])
  const collapsed = !open && (posOverride ?? (isPos || collapsedPref))
  function setCollapsed(v: boolean) {
    if (isPos) { setPosOverride(v); return }
    setCollapsedPref(v)
    writeJson('fi-nav-collapsed', v)
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
        'flex h-full flex-shrink-0 flex-col overflow-hidden',
        'border-r border-slate-200 bg-white dark:border-slate-700/60 dark:bg-[#111827]',
        'transition-[width] duration-150',
        'hidden md:relative md:flex',
        collapsed ? 'md:w-[76px]' : 'md:w-[312px]',
        open && 'fixed inset-y-0 left-0 z-[60] !flex !w-[min(340px,92vw)] shadow-2xl',
      )}>
        <Suspense fallback={<div className="flex-1" />}>
          <SideNavInner
            role={user?.role ?? ''}
            userId={user?.id ?? ''}
            hasPerm={hasPerm}
            hasModule={hasModule}
            isOwner={isOwner}
            collapsed={collapsed}
            onExpand={() => setCollapsed(false)}
            onToggleCollapsed={() => setCollapsed(!collapsed)}
            onClose={onClose}
            shopName={shopName}
            shopLogo={shopLogo}
            branchName={branchName}
            userName={user?.name ?? ''}
            roleLabel={roleLabel}
            mobile={open}
          />
        </Suspense>
      </aside>
    </>
  )
}
