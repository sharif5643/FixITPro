'use client'

import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import api from '@/lib/api'
import type { Branch } from '@/types'

/**
 * Branch for the SUNMI and staff app screens. Staff always work in their own branch. An owner
 * has no fixed branch: they pick one (kept with the web's branch choice on this device) so a sale,
 * repair, expense or stock change made from the app lands in that branch — the same as the web,
 * which sends the branch picked in its header.
 */
export function useAppBranch() {
  const user        = useAuthStore((s) => s.user)
  const selected    = useBranchStore((s) => s.selectedBranchId)
  const setSelected = useBranchStore((s) => s.setSelectedBranch)
  const canPick     = !!user && !user.branchId && (user.role === 'OWNER' || user.role === 'SUPER_ADMIN')

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches-simple'],
    queryFn:  () => api.get('/branches').then((r) => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
    enabled:  canPick,
  })
  const active = (Array.isArray(branches) ? branches : []).filter((b) => b.isActive !== false)

  // A remembered branch that was closed no longer counts; a shop with one branch needs no choice
  const branchId = canPick
    ? (active.find((b) => b.id === selected)?.id ?? (active.length === 1 ? active[0].id : undefined))
    : (user?.branchId ?? undefined)

  return {
    branchId,
    branchName: active.find((b) => b.id === branchId)?.name ?? '',
    branches: active,
    canPick:  canPick && active.length > 1,
    /** The owner must choose before recording anything that belongs to a branch */
    needsPick: canPick && !isLoading && active.length > 1 && !branchId,
    setBranch: setSelected,
  }
}
