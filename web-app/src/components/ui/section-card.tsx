import { cn } from '@/lib/utils'
import { type LucideIcon } from 'lucide-react'

interface SectionCardProps {
  title?: string
  description?: string
  icon?: LucideIcon
  headerAction?: React.ReactNode
  children: React.ReactNode
  className?: string
  contentClassName?: string
  noPadding?: boolean
}

export function SectionCard({
  title,
  description,
  icon: Icon,
  headerAction,
  children,
  className,
  contentClassName,
  noPadding = false,
}: SectionCardProps) {
  const hasHeader = title || headerAction

  return (
    <div className={cn(
      'bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] overflow-hidden',
      className,
    )}>
      {hasHeader && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && (
              <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 shrink-0">
                <Icon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">{title}</h3>
              {description && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">{description}</p>
              )}
            </div>
          </div>
          {headerAction && (
            <div className="shrink-0 ml-4">{headerAction}</div>
          )}
        </div>
      )}
      <div className={cn(!noPadding && 'p-5', contentClassName)}>
        {children}
      </div>
    </div>
  )
}
