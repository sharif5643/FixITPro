import { cn } from '@/lib/utils'
import Link from 'next/link'
import { TrendingUp, TrendingDown, type LucideIcon } from 'lucide-react'

type StatColor = 'blue' | 'emerald' | 'orange' | 'red' | 'purple' | 'teal' | 'amber' | 'slate'

const COLOR_MAP: Record<StatColor, { icon: string; bg: string; border: string }> = {
  blue:    { icon: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-900/20',       border: 'border-l-blue-500 dark:border-l-blue-600'       },
  emerald: { icon: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', border: 'border-l-emerald-500 dark:border-l-emerald-600' },
  orange:  { icon: 'text-orange-600 dark:text-orange-400',   bg: 'bg-orange-50 dark:bg-orange-900/20',   border: 'border-l-orange-500 dark:border-l-orange-600'   },
  red:     { icon: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-900/20',         border: 'border-l-red-500 dark:border-l-red-600'         },
  purple:  { icon: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-900/20',   border: 'border-l-purple-500 dark:border-l-purple-600'   },
  teal:    { icon: 'text-teal-600 dark:text-teal-400',       bg: 'bg-teal-50 dark:bg-teal-900/20',       border: 'border-l-teal-500 dark:border-l-teal-600'       },
  amber:   { icon: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20',     border: 'border-l-amber-500 dark:border-l-amber-600'     },
  slate:   { icon: 'text-slate-500 dark:text-slate-400',     bg: 'bg-slate-100 dark:bg-slate-800',       border: 'border-l-slate-400 dark:border-l-slate-600'     },
}

interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  trend?: number | null
  color?: StatColor
  href?: string
  loading?: boolean
  urgent?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
  color = 'blue',
  href,
  loading = false,
  urgent = false,
  className,
}: StatCardProps) {
  const colors = urgent
    ? { icon: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-900/20', border: '' }
    : COLOR_MAP[color]

  const inner = (
    <div className={cn(
      'group relative bg-white dark:bg-[#1E293B] rounded-2xl border transition-all duration-200 overflow-hidden',
      'shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)]',
      'hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)]',
      urgent
        ? 'border-red-200 dark:border-red-800/60 ring-1 ring-red-400/20'
        : 'border-slate-100 dark:border-slate-700/60 hover:border-slate-200 dark:hover:border-slate-600',
      className,
    )}>
      {urgent && <div className="absolute inset-x-0 top-0 h-0.5 rounded-t-2xl bg-red-500" />}
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={cn(
              'text-xs font-semibold uppercase tracking-wide',
              urgent ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500',
            )}>
              {label}
            </p>

            {loading ? (
              <div className="h-8 w-28 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-2" />
            ) : (
              <p className={cn(
                'text-2xl font-extrabold mt-1 tracking-tight leading-none tabular-nums',
                urgent ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-white',
              )}>
                {value}
              </p>
            )}

            <div className="flex items-center gap-2 mt-1.5">
              {sub && !loading && (
                <p className="text-xs text-slate-400 dark:text-slate-500 leading-snug">{sub}</p>
              )}
              {trend != null && !loading && (
                <span className={cn(
                  'flex items-center gap-0.5 text-xs font-medium',
                  trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400',
                )}>
                  {trend > 0
                    ? <TrendingUp className="h-3 w-3" />
                    : <TrendingDown className="h-3 w-3" />}
                  {Math.abs(trend)}%
                </span>
              )}
            </div>
          </div>

          {Icon && (
            <div className={cn(
              'flex h-10 w-10 items-center justify-center rounded-2xl shrink-0 transition-transform duration-200 group-hover:scale-105',
              colors.bg,
            )}>
              <Icon className={cn('h-5 w-5', colors.icon)} />
            </div>
          )}
        </div>
      </div>
    </div>
  )

  if (href) return <Link href={href} className="block">{inner}</Link>
  return inner
}

export function StatCardSkeleton() {
  return (
    <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2 mt-1">
          <div className="h-2.5 w-16 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-2.5 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="h-10 w-10 bg-slate-100 dark:bg-slate-800 rounded-2xl animate-pulse" />
      </div>
    </div>
  )
}
