'use client'

import { X, ChevronRight } from 'lucide-react'

// ── DrillDrawer ────────────────────────────────────────────────────────────────

interface DrillDrawerProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  action?: React.ReactNode
  wide?: boolean
}

export function DrillDrawer({ title, onClose, children, action, wide }: DrillDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end print:hidden">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={`relative ${wide ? 'w-full max-w-3xl' : 'w-full max-w-lg'} bg-white shadow-2xl flex flex-col h-full overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <h3 className="font-bold text-gray-900">{title}</h3>
          <div className="flex items-center gap-2">
            {action}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  )
}

// ── MetricCard ─────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  color?: string
  onClick?: () => void
  icon?: React.ElementType
}

export function MetricCard({ label, value, sub, color = 'text-gray-900', onClick, icon: Icon }: MetricCardProps) {
  const base = 'bg-white rounded-xl border p-4 space-y-1'
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} w-full text-left hover:border-blue-300 hover:shadow-sm transition-all group`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="flex items-center gap-1">
            {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
      </button>
    )
  }
  return (
    <div className={base}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <p className={`text-xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  )
}
