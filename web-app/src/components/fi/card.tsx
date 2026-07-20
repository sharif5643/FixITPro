import * as React from 'react'
import { cn } from '@/lib/utils'

interface FiCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'elevated' | 'colored'
  interactive?: boolean
  selected?: boolean
  padding?: 'none' | 'sm' | 'md' | 'lg'
  accent?: 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'teal'
}

const accentStyles = {
  primary: 'border-l-4 border-l-blue-600',
  success: 'border-l-4 border-l-emerald-500',
  warning: 'border-l-4 border-l-amber-500',
  danger:  'border-l-4 border-l-red-500',
  purple:  'border-l-4 border-l-violet-500',
  teal:    'border-l-4 border-l-teal-500',
}

const paddingStyles = {
  none: '',
  sm:   'p-3',
  md:   'p-4 sm:p-5',
  lg:   'p-5 sm:p-6',
}

export function FiCard({
  className,
  variant = 'default',
  interactive = false,
  selected = false,
  padding = 'md',
  accent,
  children,
  ...props
}: FiCardProps) {
  return (
    <div
      className={cn(
        'rounded-[var(--fi-radius,16px)] border transition-all duration-150',
        // Variants
        variant === 'default'  && 'bg-white dark:bg-[var(--fi-surface)] border-[var(--fi-border)] shadow-fi-card',
        variant === 'outline'  && 'bg-transparent border-[var(--fi-border)]',
        variant === 'ghost'    && 'bg-transparent border-transparent',
        variant === 'elevated' && 'bg-white dark:bg-[var(--fi-surface)] border-transparent shadow-fi-panel',
        variant === 'colored'  && 'bg-white dark:bg-[var(--fi-surface)] border-[var(--fi-border)]',
        // Interactive
        interactive && 'cursor-pointer hover:shadow-fi-card-hover hover:-translate-y-0.5 active:translate-y-0',
        // Selected
        selected && 'ring-2 ring-[var(--fi-primary)] border-[var(--fi-primary)]',
        // Accent strip
        accent && accentStyles[accent],
        // Padding
        paddingStyles[padding],
        className,
      )}
      {...props}
    >
      {children}
    </div>
  )
}

export function FiCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('flex items-center justify-between mb-4', className)} {...props} />
  )
}

export function FiCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={cn('text-sm font-semibold text-[var(--fi-text)] dark:text-fi-text', className)} {...props} />
  )
}

export function FiCardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('', className)} {...props} />
}
