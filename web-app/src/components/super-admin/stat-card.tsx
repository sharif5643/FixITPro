import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface SuperAdminStatCardProps {
  label: string
  value: string | number
  sub?: string
  icon?: LucideIcon
  trend?: { value: number; label: string }
  accent?: 'violet' | 'blue' | 'emerald' | 'amber' | 'red' | 'slate'
  className?: string
}

const ACCENT_ICON: Record<string, string> = {
  violet:  'bg-violet-500/10 text-violet-400',
  blue:    'bg-blue-500/10 text-blue-400',
  emerald: 'bg-emerald-500/10 text-emerald-400',
  amber:   'bg-amber-500/10 text-amber-400',
  red:     'bg-red-500/10 text-red-400',
  slate:   'bg-slate-700/50 text-slate-400',
}

const ACCENT_VALUE: Record<string, string> = {
  violet:  'text-violet-300',
  blue:    'text-blue-300',
  emerald: 'text-emerald-300',
  amber:   'text-amber-300',
  red:     'text-red-300',
  slate:   'text-white',
}

export function SuperAdminStatCard({
  label, value, sub, icon: Icon, trend, accent = 'slate', className,
}: SuperAdminStatCardProps) {
  return (
    <div className={cn(
      'bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3',
      'hover:border-slate-700 transition-colors',
      className,
    )}>
      <div className="flex items-start justify-between">
        <p className="text-slate-400 text-sm font-medium">{label}</p>
        {Icon && (
          <div className={cn('flex h-9 w-9 items-center justify-center rounded-xl', ACCENT_ICON[accent])}>
            <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
          </div>
        )}
      </div>
      <div>
        <p className={cn('text-3xl font-bold tracking-tight', ACCENT_VALUE[accent])}>
          {value}
        </p>
        {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
      </div>
      {trend && (
        <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800">
          <span className={cn(
            'text-xs font-semibold',
            trend.value >= 0 ? 'text-emerald-400' : 'text-red-400',
          )}>
            {trend.value >= 0 ? '+' : ''}{trend.value}%
          </span>
          <span className="text-slate-500 text-xs">{trend.label}</span>
        </div>
      )}
    </div>
  )
}
