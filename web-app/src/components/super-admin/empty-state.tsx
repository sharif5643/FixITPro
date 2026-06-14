import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface SuperAdminEmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function SuperAdminEmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: SuperAdminEmptyStateProps) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center py-20 px-8 text-center',
      className,
    )}>
      {Icon && (
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-800 border border-slate-700 mb-5">
          <Icon className="h-8 w-8 text-slate-500" />
        </div>
      )}
      <p className="text-slate-300 font-semibold text-base mb-1">{title}</p>
      {description && (
        <p className="text-slate-500 text-sm max-w-sm">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
