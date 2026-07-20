import * as React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FiButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success' | 'warning'
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  loading?: boolean
  icon?: React.ReactNode
  iconRight?: React.ReactNode
  fullWidth?: boolean
}

const variantStyles = {
  primary:   'bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-fi-primary active:shadow-none',
  secondary: 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-700/40 dark:hover:bg-slate-700/60 text-slate-700 dark:text-slate-200',
  outline:   'border border-[var(--fi-border)] bg-transparent hover:bg-slate-50 dark:hover:bg-slate-700/40 text-[var(--fi-text)]',
  ghost:     'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-700/40 text-[var(--fi-text-muted)]',
  danger:    'bg-[#EF4444] hover:bg-[#DC2626] text-white shadow-fi-danger active:shadow-none',
  success:   'bg-[#22C55E] hover:bg-[#16A34A] text-white shadow-fi-success active:shadow-none',
  warning:   'bg-[#F59E0B] hover:bg-[#D97706] text-white',
}

const sizeStyles = {
  xs: 'h-7 px-2.5 text-xs gap-1 rounded-lg',
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-xl',
  md: 'h-9 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-11 px-5 text-sm gap-2 rounded-xl',
  xl: 'h-12 px-6 text-base gap-2.5 rounded-2xl',
}

export function FiButton({
  className,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  disabled,
  children,
  ...props
}: FiButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none',
        variantStyles[variant],
        sizeStyles[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <Loader2 className={cn(
          'animate-spin flex-shrink-0',
          size === 'xs' ? 'h-3 w-3' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4',
        )} />
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}
      {children && <span className="truncate">{children}</span>}
      {iconRight && !loading && <span className="flex-shrink-0">{iconRight}</span>}
    </button>
  )
}
