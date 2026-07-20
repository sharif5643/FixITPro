'use client'

import { cn, formatThaiMoney } from '@/lib/utils'
import type { SeverityKey } from './types'

// ── Loading skeleton ──────────────────────────────────────────────────────────

export function Skel({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-100 dark:bg-slate-700/60', className)} />
}

// ── Premium card ──────────────────────────────────────────────────────────────

export function PCard({
  children, className, urgent,
}: { children: React.ReactNode; className?: string; urgent?: boolean }) {
  return (
    <div className={cn(
      'relative bg-white dark:bg-[#1E293B] rounded-2xl border',
      'shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)]',
      urgent
        ? 'border-red-200 dark:border-red-700/60'
        : 'border-slate-100 dark:border-slate-700/60',
      className,
    )}>
      {urgent && (
        <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-gradient-to-r from-red-500 to-rose-600" />
      )}
      {children}
    </div>
  )
}

// ── Dark-mode-aware recharts tooltip ─────────────────────────────────────────

export function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { dataKey: string; value: number; fill: string }[]
  label?: string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded-xl shadow-lg p-3 text-xs">
      <p className="font-semibold text-slate-600 dark:text-slate-300 mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.dataKey} className="flex items-center gap-2 mt-0.5">
          <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-slate-500 dark:text-slate-400">{p.dataKey}</span>
          <span className="font-bold text-slate-800 dark:text-white ml-auto">{formatThaiMoney(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

// ── Severity config (used by alerts and insights) ─────────────────────────────

export const SEV_CFG: Record<SeverityKey, { cls: string; dot: string; text: string; order: number }> = {
  CRITICAL: { cls: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700/60',         dot: 'bg-red-500',     text: 'text-red-700 dark:text-red-400',     order: 0 },
  WARNING:  { cls: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-700/60', dot: 'bg-amber-400',   text: 'text-amber-700 dark:text-amber-400', order: 1 },
  SUCCESS:  { cls: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700/60', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', order: 2 },
  INFO:     { cls: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700/60',     dot: 'bg-blue-400',    text: 'text-blue-700 dark:text-blue-400',    order: 3 },
}

// ── Branch health config ──────────────────────────────────────────────────────

export const HEALTH_CFG: Record<'NORMAL' | 'WARNING' | 'CRITICAL', { label: string; cls: string }> = {
  NORMAL:   { label: 'ปกติ',  cls: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-700/60' },
  WARNING:  { label: 'ระวัง', cls: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-700/60' },
  CRITICAL: { label: 'วิกฤต', cls: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-700/60' },
}

// ── Hover card wrapper (link + hover lift) ────────────────────────────────────

export const hoverCard = 'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] transition-all duration-200'

// ── Card section header ───────────────────────────────────────────────────────

export function CardHeader({
  iconBg, icon: Icon, iconColor, title, children,
}: {
  iconBg: string; icon: React.ElementType; iconColor: string; title: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className={cn('flex items-center justify-center h-7 w-7 rounded-xl', iconBg)}>
        <Icon className={cn('h-3.5 w-3.5', iconColor)} />
      </div>
      <h3 className="font-bold text-slate-800 dark:text-white text-sm">{title}</h3>
      {children}
    </div>
  )
}
