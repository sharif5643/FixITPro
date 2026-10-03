'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, Globe } from 'lucide-react'
import { useBranchContext } from '@/hooks/useBranchContext'
import { useBranchStore } from '@/store/branch.store'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { Branch } from '@/types'

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

/**
 * One button per active branch, so a page that says "pick a branch first" lets the owner
 * pick it right there instead of hunting for the selector in the top bar.
 */
export function BranchQuickPick({ className = '' }: { className?: string }) {
  const user = useAuthStore((s) => s.user)
  const setSelectedBranch = useBranchStore((s) => s.setSelectedBranch)
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => (await api.get('/branches')).data,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })
  const active = branches.filter((b) => b.isActive !== false)
  if (active.length === 0) return null

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {active.map((b) => (
        <button
          key={b.id}
          type="button"
          onClick={() => setSelectedBranch(b.id)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 dark:bg-slate-900 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30 transition-colors"
        >
          <Building2 className="h-3.5 w-3.5 shrink-0" />
          {b.name}
        </button>
      ))}
    </div>
  )
}

/** Inline warning used to block mutations in global mode, with branch buttons to leave it. */
export function GlobalModeBanner({ action }: { action?: string }) {
  const { isGlobalMode } = useBranchContext()
  if (!isGlobalMode) return null

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-200">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 shrink-0 text-blue-500" />
        <span>
          <span className="font-semibold">กรุณาเลือกสาขาก่อนดำเนินการ</span>
          {action && <span className="font-normal text-blue-600 dark:text-blue-300"> — {action}</span>}
        </span>
      </div>
      <BranchQuickPick className="mt-2.5 pl-6" />
    </div>
  )
}
