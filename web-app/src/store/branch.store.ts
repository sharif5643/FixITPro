import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { registerOnUserChange } from '@/lib/sign-out-hooks'

interface BranchState {
  selectedBranchId: string | null
  setSelectedBranch: (id: string | null) => void
}

export const useBranchStore = create<BranchState>()(
  persist(
    (set) => ({
      selectedBranchId: null,
      setSelectedBranch: (id) => set({ selectedBranchId: id }),
    }),
    { name: 'fixitpro-branch' },
  ),
)

// another person signing in on this device starts from their own branch
registerOnUserChange(() => useBranchStore.getState().setSelectedBranch(null))
