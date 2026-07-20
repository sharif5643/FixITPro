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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative ${wide ? 'w-full max-w-3xl' : 'w-full max-w-lg'} bg-white dark:bg-[#1E293B] shadow-[0_25px_50px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_50px_rgba(0,0,0,0.60)] flex flex-col h-full overflow-hidden`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60 shrink-0">
          <h3 className="font-bold text-slate-900 dark:text-white">{title}</h3>
          <div className="flex items-center gap-2">
            {action}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/60 text-slate-500 dark:text-slate-400 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3 bg-[#F8FAFC] dark:bg-[#0F172A]">
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

export function MetricCard({ label, value, sub, color = 'text-slate-900 dark:text-white', onClick, icon: Icon }: MetricCardProps) {
  const base = 'bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-1'
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} w-full text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.40)] hover:border-blue-200 dark:hover:border-blue-700/50 group`}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
          <div className="flex items-center gap-1">
            {Icon && <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
            <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <p className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
        {sub && <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
      </button>
    )
  }
  return (
    <div className={base}>
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{label}</p>
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />}
      </div>
      <p className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
    </div>
  )
}
