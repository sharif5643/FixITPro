'use client'

import { useQuery } from '@tanstack/react-query'
import { Building2, ChevronDown, Globe, Lock } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { useBranchStore } from '@/store/branch.store'
import { Platform } from '@/lib/platform'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import api from '@/lib/api'
import type { Branch } from '@/types'

export function BranchSelector() {
  const user             = useAuthStore((s) => s.user)
  const { selectedBranchId, setSelectedBranch } = useBranchStore()
  const isSunmi = Platform.isSunmiShell()

  const isOwner = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'

  const { data: branches = [] } = useQuery<Branch[]>({
    queryKey: ['branches'],
    queryFn: async () => (await api.get('/branches')).data,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  })

  // SUNMI: hide selector entirely — branch is always locked to JWT
  if (isSunmi) return null

  if (!isOwner) {
    const userBranch = branches.find((b) => b.id === (user as any)?.branchId)
    if (!userBranch) return null
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-xs font-medium">
        <Building2 className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate max-w-[100px]">{userBranch.name}</span>
        <Lock className="h-3 w-3 text-slate-400 shrink-0" />
      </div>
    )
  }

  const selected = branches.find((b) => b.id === selectedBranchId)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-xs px-2 sm:px-3 max-w-[160px]"
        >
          {selected ? (
            <Building2 className="h-3.5 w-3.5 shrink-0 text-blue-600" />
          ) : (
            <Globe className="h-3.5 w-3.5 shrink-0 text-slate-500" />
          )}
          <span className="truncate hidden sm:inline">
            {selected ? selected.name : 'ทุกสาขา'}
          </span>
          <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          className="gap-2 cursor-pointer"
          onClick={() => setSelectedBranch(null)}
        >
          <Globe className="h-4 w-4 text-slate-400" />
          <span>ทุกสาขา</span>
          {!selectedBranchId && (
            <span className="ml-auto text-blue-600 text-xs font-semibold">✓</span>
          )}
        </DropdownMenuItem>
        {branches.length > 0 && <DropdownMenuSeparator />}
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            className="gap-2 cursor-pointer"
            onClick={() => setSelectedBranch(branch.id)}
          >
            <Building2 className="h-4 w-4 text-blue-500" />
            <div className="flex flex-col min-w-0">
              <span className="truncate">{branch.name}</span>
              {!branch.isActive && (
                <span className="text-[10px] text-slate-400">ปิดใช้งาน</span>
              )}
            </div>
            {selectedBranchId === branch.id && (
              <span className="ml-auto text-blue-600 text-xs font-semibold">✓</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
