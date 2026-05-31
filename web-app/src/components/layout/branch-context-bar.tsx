'use client'

import { Building2, Globe } from 'lucide-react'
import { useBranchContext } from '@/hooks/useBranchContext'

interface Props {
  className?: string
}

export function BranchContextBar({ className = '' }: Props) {
  const { branchName, isGlobalMode } = useBranchContext()

  if (isGlobalMode) {
    return (
      <div className={`flex items-center gap-1.5 rounded-lg bg-blue-50 border border-blue-200 px-3 py-1.5 text-sm text-blue-700 ${className}`}>
        <Globe className="h-3.5 w-3.5 shrink-0" />
        <span className="font-medium">ทุกสาขา</span>
        <span className="text-blue-500 font-normal text-xs ml-1">— โหมดดูภาพรวม</span>
      </div>
    )
  }

  if (!branchName) return null

  return (
    <div className={`flex items-center gap-1.5 rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-sm text-slate-600 ${className}`}>
      <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span>
        สาขาปัจจุบัน:{' '}
        <span className="font-semibold text-slate-800">{branchName}</span>
      </span>
    </div>
  )
}

/** Inline warning used to block mutations in global mode. */
export function GlobalModeBanner({ action }: { action?: string }) {
  const { isGlobalMode } = useBranchContext()
  if (!isGlobalMode) return null

  return (
    <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <Globe className="h-4 w-4 shrink-0 text-blue-500" />
      <span>
        <span className="font-semibold">กรุณาเลือกสาขาก่อนดำเนินการ</span>
        {action && <span className="font-normal text-blue-600"> — {action}</span>}
      </span>
    </div>
  )
}
