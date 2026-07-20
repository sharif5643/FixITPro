import * as React from 'react'
import { cn } from '@/lib/utils'

interface FiBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'primary' | 'success' | 'warning' | 'danger' | 'neutral' | 'purple' | 'teal' | 'outline'
  size?: 'sm' | 'md'
  dot?: boolean
}

const variantStyles = {
  primary: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-800',
  success: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800',
  warning: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-100 dark:border-amber-800',
  danger:  'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border-red-100 dark:border-red-800',
  neutral: 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700/60',
  purple:  'bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border-violet-100 dark:border-violet-800',
  teal:    'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border-teal-100 dark:border-teal-800',
  outline: 'bg-transparent text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600',
}

const dotColors = {
  primary: 'bg-blue-600',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger:  'bg-red-500',
  neutral: 'bg-slate-400',
  purple:  'bg-violet-500',
  teal:    'bg-teal-500',
  outline: 'bg-slate-400',
}

export function FiBadge({
  className,
  variant = 'neutral',
  size = 'sm',
  dot = false,
  children,
  ...props
}: FiBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 border font-semibold leading-none',
        size === 'sm' ? 'px-2 py-1 text-[10px] rounded-full' : 'px-2.5 py-1.5 text-xs rounded-full',
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {dot && (
        <span className={cn('h-1.5 w-1.5 rounded-full flex-shrink-0', dotColors[variant])} />
      )}
      {children}
    </span>
  )
}
