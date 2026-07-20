'use client'

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { forwardRef } from 'react'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
  autoFocus?: boolean
  className?: string
  onFocus?: () => void
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = 'ค้นหา...', inputMode, autoFocus, className, onFocus }, ref) => (
    <div className={cn('relative', className)}>
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        ref={ref}
        type="search"
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          'h-11 w-full rounded-2xl bg-[#F8F9FB] dark:bg-[#1E293B] pl-11 pr-10 text-sm outline-none',
          'border border-transparent focus:border-[#FFC107]/40 focus:ring-2 focus:ring-[#FFC107]/20',
          'text-[#111] dark:text-white placeholder:text-slate-400 transition',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 -translate-y-1/2 h-[44px] w-[44px] flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          aria-label="ล้างการค้นหา"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  ),
)
SearchInput.displayName = 'SearchInput'
