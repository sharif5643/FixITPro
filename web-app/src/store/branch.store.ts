import { create } from 'zustand'
import { persist } from 'zustand/middleware'

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
