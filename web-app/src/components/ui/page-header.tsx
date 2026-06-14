import { cn } from '@/lib/utils'
import Link from 'next/link'
import { ChevronRight, type LucideIcon } from 'lucide-react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  primaryAction?: React.ReactNode
  secondaryActions?: React.ReactNode
  breadcrumbs?: BreadcrumbItem[]
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  icon: Icon,
  primaryAction,
  secondaryActions,
  breadcrumbs,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-slate-400 mb-2">
          {breadcrumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-slate-600 transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className={i === breadcrumbs.length - 1 ? 'text-slate-600 font-medium' : ''}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {Icon && (
            <div className="h-9 w-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-blue-600" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 leading-tight truncate">{title}</h1>
            {subtitle && (
              <p className="text-sm text-slate-500 mt-0.5 leading-snug">{subtitle}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        {(primaryAction || secondaryActions) && (
          <div className="flex items-center gap-2 shrink-0">
            {secondaryActions}
            {primaryAction}
          </div>
        )}
      </div>
    </div>
  )
}
