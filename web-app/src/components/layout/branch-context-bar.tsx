'use client'

import { useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Building2, Globe } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
function useActiveBranches() {
  const user = useAuthStore((s) => s.user)
  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => (await api.get('/branches')).data,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })
  return branches.filter((b) => b.isActive !== false)
}

/**
 * The branch the owner last worked in (still open). `pickLast()` switches to it and says so, so
 * selling or taking a repair from "all branches" does not stop to ask for a branch every time.
 */
export function useLastBranch() {
  const lastBranchId = useBranchStore((s) => s.lastBranchId)
  const setSelectedBranch = useBranchStore((s) => s.setSelectedBranch)
  const last = useActiveBranches().find((b) => b.id === lastBranchId) ?? null
  const pickLast = useCallback(() => {
    if (!last) return false
    setSelectedBranch(last.id)
    toast.info(`ใช้สาขา ${last.name} (ที่ใช้ล่าสุด) — เปลี่ยนสาขาได้ที่ปุ่มสาขาด้านบน`)
    return true
  }, [last, setSelectedBranch])
  return { last, pickLast }
}

export function BranchQuickPick({ className = '' }: { className?: string }) {
  const setSelectedBranch = useBranchStore((s) => s.setSelectedBranch)
  const lastBranchId = useBranchStore((s) => s.lastBranchId)
  const active = useActiveBranches()
  if (active.length === 0) return null
  // the branch used last comes first, marked
  const ordered = [...active].sort((a, b) => Number(b.id === lastBranchId) - Number(a.id === lastBranchId))

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {ordered.map((b) => {
        const isLast = b.id === lastBranchId
        return (
          <button
            key={b.id}
            type="button"
            onClick={() => setSelectedBranch(b.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
              isLast
                ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50 dark:bg-slate-900 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30',
            )}
          >
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            {b.name}
            {isLast && <span className="text-xs font-normal opacity-90">(ใช้ล่าสุด)</span>}
          </button>
        )
      })}
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
