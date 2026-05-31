'use client'

import { cn } from '@/lib/utils'
import {
  badgeColors,
  repairStatusColor,
  slaTierColor,
  stockAlertColor,
  type BadgeColor,
} from '@/styles/design-tokens'
import type { LucideIcon } from 'lucide-react'

// ── Base StatusBadge ──────────────────────────────────────────────────────────

interface StatusBadgeProps {
  label:    string
  color?:   BadgeColor
  /** Shows an animated pulsing dot (for urgent/active states) */
  pulse?:   boolean
  icon?:    LucideIcon
  size?:    'xs' | 'sm' | 'md'
  className?: string
}

export function StatusBadge({
  label,
  color  = 'slate',
  pulse  = false,
  icon: Icon,
  size   = 'sm',
  className,
}: StatusBadgeProps) {
  const colors = badgeColors[color]
  const sizeClasses = {
    xs: 'text-[10px] px-1.5 py-0.5 gap-1',
    sm: 'text-xs    px-2   py-0.5 gap-1.5',
    md: 'text-sm    px-2.5 py-1   gap-2',
  }

  return (
    <span className={cn(
      'inline-flex items-center rounded-full border font-semibold whitespace-nowrap',
      colors.bg,
      colors.text,
      colors.border,
      sizeClasses[size],
      className,
    )}>
      {/* Pulse dot OR icon */}
      {pulse ? (
        <span className="relative flex h-1.5 w-1.5 shrink-0">
          <span className={cn('animate-ping absolute inline-flex h-full w-full rounded-full opacity-75', colors.dot)} />
          <span className={cn('relative inline-flex rounded-full h-1.5 w-1.5', colors.dot)} />
        </span>
      ) : Icon ? (
        <Icon className="h-3 w-3 shrink-0" />
      ) : (
        <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', colors.dot)} />
      )}
      {label}
    </span>
  )
}

// ── Repair status badge ───────────────────────────────────────────────────────

const REPAIR_LABEL: Record<string, string> = {
  RECEIVED:         'รับงาน',
  DIAGNOSING:       'ตรวจสอบ',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  COMPLETED:        'พร้อมรับ',
  DELIVERED:        'ส่งคืนแล้ว',
  CANCELLED:        'ยกเลิก',
}

const REPAIR_URGENT = new Set(['WAITING_APPROVAL', 'WAITING_PARTS'])

export function RepairStatusBadge({
  status,
  size = 'sm',
  className,
}: {
  status: string
  size?:  'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <StatusBadge
      label     = {REPAIR_LABEL[status] ?? status}
      color     = {repairStatusColor[status] ?? 'slate'}
      pulse     = {REPAIR_URGENT.has(status)}
      size      = {size}
      className = {className}
    />
  )
}

// ── SLA severity badge ────────────────────────────────────────────────────────

const SLA_LABEL: Record<string, string> = {
  green:  'ปกติ',
  yellow: 'เฝ้าระวัง',
  red:    'เกินกำหนด',
}

export function SLABadge({
  tier,
  ageText,
  size = 'xs',
  className,
}: {
  tier:      string
  ageText?:  string
  size?:     'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <StatusBadge
      label     = {ageText ?? SLA_LABEL[tier] ?? tier}
      color     = {slaTierColor[tier] ?? 'slate'}
      pulse     = {tier === 'red'}
      size      = {size}
      className = {className}
    />
  )
}

// ── Stock alert badge ─────────────────────────────────────────────────────────

const STOCK_LABEL: Record<string, string> = {
  NORMAL:    'ปกติ',
  LOW:       'สต็อกต่ำ',
  STOCKOUT:  'หมดสต็อก',
  OVERSTOCK: 'สต็อกเกิน',
}

export function StockAlertBadge({
  status,
  size = 'sm',
  className,
}: {
  status:     string
  size?:      'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <StatusBadge
      label     = {STOCK_LABEL[status] ?? status}
      color     = {stockAlertColor[status as keyof typeof stockAlertColor] ?? 'slate'}
      pulse     = {status === 'STOCKOUT'}
      size      = {size}
      className = {className}
    />
  )
}

// ── Notification severity badge ───────────────────────────────────────────────

const NOTIF_COLOR: Record<string, BadgeColor> = {
  INFO:     'blue',
  WARNING:  'yellow',
  ERROR:    'red',
  CRITICAL: 'red',
}

const NOTIF_LABEL: Record<string, string> = {
  INFO:     'ข้อมูล',
  WARNING:  'เตือน',
  ERROR:    'ผิดพลาด',
  CRITICAL: 'วิกฤต',
}

export function NotifSeverityBadge({
  severity,
  size = 'xs',
  className,
}: {
  severity:   string
  size?:      'xs' | 'sm' | 'md'
  className?: string
}) {
  return (
    <StatusBadge
      label     = {NOTIF_LABEL[severity] ?? severity}
      color     = {NOTIF_COLOR[severity] ?? 'blue'}
      pulse     = {severity === 'CRITICAL'}
      size      = {size}
      className = {className}
    />
  )
}
