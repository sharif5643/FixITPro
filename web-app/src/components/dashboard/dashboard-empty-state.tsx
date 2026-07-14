import type { ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
  className?: string
}

export function DashboardEmptyState({ icon: Icon, title, description, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center gap-3 py-12 text-center', className)}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800">
        <Icon className="h-7 w-7 text-slate-400 dark:text-slate-500" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</p>
        <p className="max-w-xs text-xs text-slate-400 dark:text-slate-500">{description}</p>
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  )
}
