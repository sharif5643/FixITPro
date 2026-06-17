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
      'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden',
      className,
    )}>
      {hasHeader && (
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-white leading-tight">{title}</h3>
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
