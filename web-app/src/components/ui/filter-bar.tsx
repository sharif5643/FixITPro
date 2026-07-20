import { cn } from '@/lib/utils'
import { Search, X } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface FilterBarProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  children?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  compact?: boolean
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'ค้นหา...',
  children,
  actions,
  className,
  compact = false,
}: FilterBarProps) {
  const hasSearch = onSearchChange !== undefined

  return (
    <div className={cn(
      'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
      compact ? 'py-2' : 'py-1',
      className,
    )}>
      {/* Left: search + filters */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center flex-1 min-w-0">
        {hasSearch && (
          <div className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none" />
            <Input
              value={searchValue}
              onChange={e => onSearchChange!(e.target.value)}
              placeholder={searchPlaceholder}
              className="pl-9 pr-8 h-9 text-sm bg-white dark:bg-[#1E293B] border-slate-200 dark:border-slate-700/60 focus:border-blue-400 dark:focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            />
            {searchValue && (
              <button
                onClick={() => onSearchChange!('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Filter chips/selects */}
        {children && (
          <div className="flex flex-wrap items-center gap-2">
            {children}
          </div>
        )}
      </div>

      {/* Right: action buttons */}
      {actions && (
        <div className="flex items-center gap-2 shrink-0">
          {actions}
        </div>
      )}
    </div>
  )
}
