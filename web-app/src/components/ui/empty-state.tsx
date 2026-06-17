import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Package, Wrench, Bell, Users, BarChart2, ShoppingCart,
  Inbox, Search, AlertTriangle, FileText, BadgeCheck, ArrowRightLeft,
  Clock, type LucideIcon,
} from 'lucide-react'

// ── Preset icon / copy maps ───────────────────────────────────────────────────

type EmptyPreset =
  | 'repairs'
  | 'products'
  | 'notifications'
  | 'customers'
  | 'analytics'
  | 'sales'
  | 'debt'
  | 'stock'
  | 'search'
  | 'warranty'
  | 'technicians'
  | 'transfers'
  | 'shifts'
  | 'default'

const PRESETS: Record<EmptyPreset, { icon: LucideIcon; title: string; description: string }> = {
  repairs:       { icon: Wrench,       title: 'ยังไม่มีงานซ่อม',       description: 'เมื่อรับงานซ่อมจะแสดงรายการที่นี่' },
  products:      { icon: Package,      title: 'ยังไม่มีสินค้า',         description: 'เพิ่มสินค้าเพื่อเริ่มต้นขาย' },
  notifications: { icon: Bell,         title: 'ไม่มีการแจ้งเตือน',     description: 'คุณรับรู้ทุกอย่างแล้ว' },
  customers:     { icon: Users,        title: 'ยังไม่มีลูกค้า',         description: 'ลูกค้าที่ลงทะเบียนจะแสดงที่นี่' },
  analytics:     { icon: BarChart2,    title: 'ยังไม่มีข้อมูล',         description: 'ข้อมูลจะแสดงเมื่อมีการทำรายการ' },
  sales:         { icon: ShoppingCart, title: 'ยังไม่มีรายการขาย',     description: 'บิลขายจะแสดงที่นี่' },
  debt:          { icon: AlertTriangle,'title': 'ไม่มีหนี้ค้างชำระ',   description: 'ลูกค้าทุกคนชำระเงินครบแล้ว' },
  stock:         { icon: Package,      title: 'ไม่มีสต็อกค้าง',        description: 'สินค้าทุกรายการมีการเคลื่อนไหว' },
  search:        { icon: Search,       title: 'ไม่พบผลลัพธ์',           description: 'ลองค้นหาด้วยคำอื่น หรือปรับตัวกรอง' },
  warranty:      { icon: BadgeCheck,    title: 'ยังไม่มีการรับประกัน',   description: 'การรับประกันงานซ่อมและสินค้าจะแสดงที่นี่' },
  technicians:   { icon: Users,        title: 'ไม่มีข้อมูลช่างซ่อม',    description: 'อันดับและสถิติช่างจะแสดงเมื่อมีงานซ่อม' },
  transfers:     { icon: ArrowRightLeft,'title': 'ยังไม่มีรายการโอนสต็อก', description: 'รายการโอนสินค้าระหว่างสาขาจะแสดงที่นี่' },
  shifts:        { icon: Clock,        title: 'ยังไม่มีประวัติกะ',      description: 'ประวัติการเปิด-ปิดกะจะแสดงที่นี่' },
  default:       { icon: Inbox,        title: 'ไม่มีข้อมูล',            description: 'ยังไม่มีรายการในขณะนี้' },
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  preset?: EmptyPreset
  icon?: LucideIcon
  title?: string
  description?: string
  ctaLabel?: string
  onCta?: () => void
  ctaHref?: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export function EmptyState({
  preset = 'default',
  icon,
  title,
  description,
  ctaLabel,
  onCta,
  ctaHref,
  size = 'md',
  className,
}: EmptyStateProps) {
  const defaults  = PRESETS[preset]
  const Icon      = icon ?? defaults.icon
  const finalTitle = title ?? defaults.title
  const finalDesc  = description ?? defaults.description

  const iconSize  = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-14 w-14' : 'h-10 w-10'
  const iconWrap  = size === 'sm' ? 'h-14 w-14' : size === 'lg' ? 'h-24 w-24' : 'h-18 w-18'
  const py        = size === 'sm' ? 'py-6' : size === 'lg' ? 'py-16' : 'py-10'
  const titleSize = size === 'sm' ? 'text-sm font-semibold' : size === 'lg' ? 'text-lg font-bold' : 'text-base font-semibold'
  const descSize  = size === 'sm' ? 'text-xs' : 'text-sm'

  const ctaElement = ctaLabel && (
    ctaHref ? (
      <a href={ctaHref}>
        <Button size={size === 'lg' ? 'default' : 'sm'} className="mt-1">
          {ctaLabel}
        </Button>
      </a>
    ) : (
      <Button size={size === 'lg' ? 'default' : 'sm'} onClick={onCta} className="mt-1">
        {ctaLabel}
      </Button>
    )
  )

  return (
    <div className={cn('flex flex-col items-center justify-center text-center', py, className)}>
      {/* Icon blob */}
      <div className={cn(
        'flex items-center justify-center rounded-2xl bg-muted mb-4',
        iconWrap,
      )}>
        <Icon className={cn(iconSize, 'text-muted-foreground opacity-50')} />
      </div>

      {/* Copy */}
      <p className={cn(titleSize, 'text-foreground')}>{finalTitle}</p>
      <p className={cn(descSize, 'text-muted-foreground mt-1 max-w-[260px]')}>{finalDesc}</p>

      {/* CTA */}
      {ctaElement}
    </div>
  )
}

// ── Inline variant (for table cells / small areas) ────────────────────────────

export function EmptyRow({
  message = 'ไม่มีข้อมูล',
  colSpan = 6,
}: {
  message?: string
  colSpan?: number
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-12 text-center text-sm text-muted-foreground">
        {message}
      </td>
    </tr>
  )
}
