import React from 'react'
import { cn } from '@/lib/utils'

// ── Base ──────────────────────────────────────────────────────────────────────

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={cn('bg-slate-100 rounded animate-pulse', className)} style={style} />
  )
}

// ── Stat card skeleton ────────────────────────────────────────────────────────

export function StatCardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border-l-4 border-l-slate-200 border border-slate-100 shadow-sm p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 space-y-2 mt-1">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-8 w-24" />
              <Skeleton className="h-2.5 w-12" />
            </div>
            <Skeleton className="h-9 w-9 rounded-xl" />
          </div>
        </div>
      ))}
    </>
  )
}

// ── Table rows skeleton ───────────────────────────────────────────────────────

export function TableRowsSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3.5 px-4 border-b border-slate-50">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn('h-4 flex-1', j === 0 ? 'max-w-[120px]' : j === cols - 1 ? 'max-w-[80px]' : '')}
            />
          ))}
        </div>
      ))}
    </>
  )
}

// ── Card skeleton ─────────────────────────────────────────────────────────────

export function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${100 - i * 15}%` }} />
      ))}
    </div>
  )
}

// ── Form skeleton ─────────────────────────────────────────────────────────────

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-9 w-full" />
        </div>
      ))}
    </div>
  )
}

// ── Page skeleton (full page) ─────────────────────────────────────────────────

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-xl" />
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-3.5 w-56" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* Filter bar */}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-64 rounded-lg" />
        <Skeleton className="h-9 w-36 rounded-lg" />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-2.5">
          <div className="flex gap-4">
            {[100, 60, 80, 60].map((w, i) => (
              <Skeleton key={i} className="h-3 rounded" style={{ width: w }} />
            ))}
          </div>
        </div>
        <TableRowsSkeleton rows={7} cols={4} />
      </div>
    </div>
  )
}
