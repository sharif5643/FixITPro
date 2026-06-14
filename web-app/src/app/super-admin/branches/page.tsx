'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { GitBranch, Building2, Search, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import type { SuperAdminBranch } from '@/types'
import { cn } from '@/lib/utils'

function BranchStatusDot({ isActive, status }: { isActive: boolean; status: string }) {
  if (!isActive || status === 'SUSPENDED') {
    return <span className="inline-flex h-2 w-2 rounded-full bg-orange-500" />
  }
  if (status === 'PENDING_APPROVAL') {
    return <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
  }
  return <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
}

export default function BranchesPage() {
  const [search, setSearch] = useState('')

  const { data: statsData } = useQuery<{ total: number; active: number; suspended: number }>({
    queryKey: ['sa-branches-stats'],
    queryFn: () => api.get('/super-admin/branches/stats').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data, isLoading, isError } = useQuery<{ data: SuperAdminBranch[]; total: number }>({
    queryKey: ['sa-branches', search],
    queryFn: () =>
      api.get('/super-admin/branches', { params: { search: search || undefined } }).then((r) => r.data),
    refetchInterval: 60_000,
  })

  const branches = data?.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">สาขาทั้งหมด</h1>
          <p className="text-slate-400 text-sm mt-0.5">รวมสาขาจากทุก Tenant ในแพลตฟอร์ม</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SuperAdminStatCard
          label="Total Branches"
          value={statsData?.total ?? '—'}
          icon={GitBranch}
          accent="blue"
          sub="ทุกสาขาในระบบ"
        />
        <SuperAdminStatCard
          label="Active"
          value={statsData?.active ?? '—'}
          icon={Building2}
          accent="emerald"
        />
        <SuperAdminStatCard
          label="Suspended"
          value={statsData?.suspended ?? '—'}
          icon={AlertTriangle}
          accent="amber"
        />
      </div>

      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาสาขา..."
          className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 text-sm rounded-xl"
        />
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-400" />
            <p className="text-white font-semibold text-sm">All Branches</p>
          </div>
          {data && (
            <span className="text-slate-500 text-xs">{data.total} สาขา</span>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <p className="text-red-400 text-sm">โหลดข้อมูลไม่สำเร็จ</p>
          </div>
        ) : branches.length === 0 ? (
          <SuperAdminEmptyState
            icon={GitBranch}
            title="ไม่พบสาขา"
            description={search ? 'ลองค้นหาด้วยคำอื่น' : 'ยังไม่มีสาขาในระบบ'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">สาขา</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Tenant</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">สถานะ</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden sm:table-cell">Users</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden lg:table-cell">สร้างเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {branches.map((b) => (
                <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-5">
                    <p className="text-white font-medium">{b.name}</p>
                    {b.address && <p className="text-slate-500 text-xs mt-0.5">{b.address}</p>}
                  </td>
                  <td className="py-3.5 px-5 hidden md:table-cell">
                    {b.tenant ? (
                      <span className="text-slate-300 text-sm">{b.tenant.shopName}</span>
                    ) : (
                      <span className="text-slate-600 text-xs italic">ยังไม่ผูกกับร้าน</span>
                    )}
                  </td>
                  <td className="py-3.5 px-5">
                    <div className="flex items-center gap-2">
                      <BranchStatusDot isActive={b.isActive} status={b.status} />
                      <span className={cn(
                        'text-xs font-medium',
                        b.isActive && b.status === 'ACTIVE' ? 'text-emerald-400' : 'text-orange-400',
                      )}>
                        {b.isActive && b.status === 'ACTIVE' ? 'Active' :
                         b.status === 'SUSPENDED' ? 'Suspended' :
                         b.status === 'PENDING_APPROVAL' ? 'Pending' : 'Inactive'}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 px-5 hidden sm:table-cell">
                    <span className="text-slate-400 text-sm">{b._count.users}</span>
                  </td>
                  <td className="py-3.5 px-5 hidden lg:table-cell">
                    <span className="text-slate-500 text-xs">
                      {format(new Date(b.createdAt), 'd MMM yyyy', { locale: th })}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
