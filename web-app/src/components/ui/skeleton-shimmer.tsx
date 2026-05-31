import { cn } from '@/lib/utils'

// ── Base shimmer block ────────────────────────────────────────────────────────

export function Shimmer({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('shimmer-block rounded-lg', className)}
    />
  )
}

// ── Stat card skeleton ────────────────────────────────────────────────────────

export function ShimmerStatCard() {
  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3 animate-fade-in">
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-2 flex-1">
          <Shimmer className="h-3 w-24" />
          <Shimmer className="h-7 w-32" />
          <Shimmer className="h-2.5 w-20" />
        </div>
        <Shimmer className="h-9 w-9 rounded-xl flex-shrink-0" />
      </div>
    </div>
  )
}

// ── Table row skeleton ────────────────────────────────────────────────────────

export function ShimmerRow({ cols = 4 }: { cols?: number }) {
  const widths = ['w-32', 'w-24', 'w-20', 'w-16', 'w-28']
  return (
    <div className="flex items-center gap-3 py-3 px-1">
      <Shimmer className="h-8 w-8 rounded-full flex-shrink-0" />
      <div className="flex flex-1 items-center gap-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Shimmer key={i} className={cn('h-3.5', widths[i % widths.length])} />
        ))}
      </div>
    </div>
  )
}

// ── Table skeleton ────────────────────────────────────────────────────────────

export function ShimmerTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <ShimmerRow key={i} cols={cols} />
      ))}
    </div>
  )
}

// ── Text block skeleton ───────────────────────────────────────────────────────

export function ShimmerText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Shimmer
          key={i}
          className={cn('h-3.5', i === lines - 1 ? 'w-3/4' : 'w-full')}
        />
      ))}
    </div>
  )
}

// ── Kanban card skeleton ──────────────────────────────────────────────────────

export function ShimmerKanbanCard() {
  return (
    <div className="rounded-xl border bg-card p-3 space-y-2">
      <Shimmer className="h-1 w-full rounded-full" />
      <div className="flex items-center justify-between">
        <Shimmer className="h-3 w-16" />
        <Shimmer className="h-4 w-20 rounded-full" />
      </div>
      <Shimmer className="h-3.5 w-36" />
      <Shimmer className="h-3 w-28" />
      <Shimmer className="h-3 w-full" />
      <div className="flex gap-1 pt-1 border-t">
        <Shimmer className="h-5 w-14 rounded-full" />
        <Shimmer className="h-5 w-12 rounded-full" />
      </div>
    </div>
  )
}

// ── Notification item skeleton ────────────────────────────────────────────────

export function ShimmerNotification() {
  return (
    <div className="flex items-start gap-3 p-3">
      <Shimmer className="h-8 w-8 rounded-full flex-shrink-0 mt-0.5" />
      <div className="flex-1 space-y-2">
        <Shimmer className="h-3.5 w-40" />
        <Shimmer className="h-3 w-full" />
        <Shimmer className="h-2.5 w-16" />
      </div>
    </div>
  )
}
