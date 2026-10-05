'use client'

import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'
import type { Branch } from '@/types'

export interface BranchContext {
  /** Effective branchId for API queries. undefined = global (all branches). */
  branchId: string | undefined
  /** Display name of the current branch, or 'ทุกสาขา' in global mode. */
  branchName: string
  /** True when OWNER has no branch selected (aggregate / all-branches view). */
  isGlobalMode: boolean
  /** True when user is OWNER or SUPER_ADMIN. */
  isOwner: boolean
  /** True when running on a SUNMI device or in SUNMI mode. */
  isSunmi: boolean
  /** True when the user cannot change their branch (staff or SUNMI). */
  isBranchLocked: boolean
}

export function useBranchContext(): BranchContext {
  const user             = useAuthStore((s) => s.user)
  const storedBranchId   = useBranchStore((s) => s.selectedBranchId)
  const setSelected      = useBranchStore((s) => s.setSelectedBranch)
  const isSunmi          = Platform.isSunmiShell()

  const isOwner       = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const isBranchLocked = !isOwner || isSunmi

  const { data: branches = [], isSuccess } = useQuery<Branch[]>({
    queryKey: ['branches-simple'],
    queryFn:  () => api.get('/branches').then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled:  !!user,
  })

  // The choice is kept per device, so it can belong to another account that signed in here before
  // (or to a branch since closed). Only a branch of this shop counts; otherwise show all branches.
  const known            = !isSuccess || !storedBranchId || branches.some((b) => b.id === storedBranchId)
  const selectedBranchId = known ? storedBranchId : null
  useEffect(() => {
    if (isOwner && !known) setSelected(null)
  }, [isOwner, known, setSelected])

  // Staff / SUNMI → always JWT branch. OWNER → selected or undefined (global).
  const branchId: string | undefined = isBranchLocked
    ? (user?.branchId ?? undefined)
    : (selectedBranchId ?? undefined)

  const isGlobalMode = isOwner && !isSunmi && !selectedBranchId

  // Never show a raw id: while the list loads (or for a branch it does not hold) show a plain label
  const branchName = isGlobalMode
    ? 'ทุกสาขา'
    : (branches.find((b) => b.id === branchId)?.name ?? (branchId ? (isSuccess ? 'สาขาของคุณ' : '') : ''))

  return { branchId, branchName, isGlobalMode, isOwner, isSunmi, isBranchLocked }
}
