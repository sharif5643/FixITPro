import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerOnUserChange } from '@/lib/sign-out-hooks'

interface BranchState {
  selectedBranchId: string | null
  /** The last single branch the owner worked in, so selling / taking a repair from
   *  "all branches" goes straight there instead of asking every time */
  lastBranchId: string | null
  setSelectedBranch: (id: string | null) => void
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      lastBranchId: null,
      setSelectedBranch: (id) => set(id ? { selectedBranchId: id, lastBranchId: id } : { selectedBranchId: null }),
    }),
    { name: 'fixitpro-branch' },
  ),
)

// another person signing in on this device starts from their own branch
registerOnUserChange(() => useBranchStore.setState({ selectedBranchId: null, lastBranchId: null }))
