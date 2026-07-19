import * as React from 'react'
import { cn } from '@/lib/utils'

interface FiInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  hint?: string
  error?: string
  prefixIcon?: React.ReactNode
  suffixIcon?: React.ReactNode
  prefixText?: string
  suffixText?: string
  size?: 'sm' | 'md' | 'lg'
}

export const FiInput = React.forwardRef<HTMLInputElement, FiInputProps>(
  ({ className, label, hint, error, prefixIcon, suffixIcon, prefixText, suffixText, size = 'md', id, ...props }, ref) => {
    const inputId = id ?? React.useId()
    const hasPrefix = !!prefixIcon || !!prefixText
    const hasSuffix = !!suffixIcon || !!suffixText

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-[var(--fi-text)]">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {hasPrefix && (
            <div className="absolute left-3 flex items-center pointer-events-none text-[var(--fi-text-muted)]">
              {prefixIcon ?? <span className="text-sm">{prefixText}</span>}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'w-full rounded-xl border bg-white dark:bg-slate-900 text-[var(--fi-text)] placeholder:text-[var(--fi-text-faint)] transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-[var(--fi-primary)] focus:border-[var(--fi-primary)]',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error
                ? 'border-red-400 focus:ring-red-400 focus:border-red-400'
                : 'border-[var(--fi-border)] hover:border-slate-300 dark:hover:border-slate-600',
              size === 'sm' ? 'h-8 text-xs' : size === 'lg' ? 'h-12 text-base' : 'h-10 text-sm',
              hasPrefix ? 'pl-9' : 'pl-3.5',
              hasSuffix ? 'pr-9' : 'pr-3.5',
              className,
            )}
            {...props}
          />
          {hasSuffix && (
            <div className="absolute right-3 flex items-center pointer-events-none text-[var(--fi-text-muted)]">
              {suffixIcon ?? <span className="text-sm">{suffixText}</span>}
            </div>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
        {hint && !error && <p className="text-xs text-[var(--fi-text-faint)]">{hint}</p>}
      </div>
    )
  },
)
FiInput.displayName = 'FiInput'
