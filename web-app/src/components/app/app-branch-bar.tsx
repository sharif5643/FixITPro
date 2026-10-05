'use client'

import { GitBranch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppBranch } from '@/hooks/useAppBranch'

/** Owner's branch choice on the SUNMI / staff screens. Renders nothing for staff or one-branch shops. */
export function AppBranchBar({ className }: { className?: string }) {
  const { canPick, needsPick, branchId, branches, setBranch } = useAppBranch()
  if (!canPick) return null
  return (
    <label className={cn('flex items-center gap-2 px-3 py-2 text-sm',
      needsPick ? 'bg-amber-100 text-amber-900' : 'bg-white text-slate-700 border-b border-slate-100', className)}>
      <GitBranch className="h-4 w-4 shrink-0" />
      <span className="shrink-0 font-semibold">{needsPick ? 'เลือกสาขาก่อนทำรายการ:' : 'สาขา:'}</span>
      <select value={branchId ?? ''} onChange={(e) => setBranch(e.target.value || null)}
        className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900">
        <option value="" disabled>— เลือกสาขา —</option>
        {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </label>
  )
}
