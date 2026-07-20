import { cn } from '@/lib/utils'

// ── Table shell ───────────────────────────────────────────────────────────────

export function DataTable({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full text-sm border-collapse">
        {children}
      </table>
    </div>
  )
}

// ── Head ──────────────────────────────────────────────────────────────────────

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-[#1E293B]/50">
        {children}
      </tr>
    </thead>
  )
}

export function DataTableHeadCell({
  children,
  className,
  right = false,
  hidden = false,
}: {
  children?: React.ReactNode
  className?: string
  right?: boolean
  hidden?: boolean
}) {
  return (
    <th className={cn(
      'py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide whitespace-nowrap',
      right ? 'text-right' : 'text-left',
      hidden && 'hidden sm:table-cell',
      className,
    )}>
      {children}
    </th>
  )
}

// ── Body ──────────────────────────────────────────────────────────────────────

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return (
    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
      {children}
    </tbody>
  )
}

export function DataTableRow({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        'hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      {children}
    </tr>
  )
}

export function DataTableCell({
  children,
  className,
  right = false,
  hidden = false,
  muted = false,
}: {
  children?: React.ReactNode
  className?: string
  right?: boolean
  hidden?: boolean
  muted?: boolean
}) {
  return (
    <td className={cn(
      'py-3 px-3',
      right ? 'text-right' : 'text-left',
      hidden && 'hidden sm:table-cell',
      muted ? 'text-slate-400 dark:text-slate-500' : 'text-slate-700 dark:text-slate-200',
      className,
    )}>
      {children}
    </td>
  )
}

// ── Empty row ─────────────────────────────────────────────────────────────────

export function DataTableEmptyRow({
  message = 'ไม่มีข้อมูล',
  colSpan = 99,
}: {
  message?: string
  colSpan?: number
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-16 text-center">
        <p className="text-sm text-slate-400 dark:text-slate-500">{message}</p>
      </td>
    </tr>
  )
}

// ── Loading rows ──────────────────────────────────────────────────────────────

export function DataTableLoadingRows({
  rows = 5,
  cols = 5,
}: {
  rows?: number
  cols?: number
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-slate-50 dark:border-slate-700/60">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="py-3 px-3">
              <div
                className="h-4 bg-slate-100 dark:bg-slate-700/60 rounded animate-pulse"
                style={{ width: `${60 + (j * 10) % 40}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
