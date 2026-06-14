'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Users, Shield, UserCheck, Search, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import type { SuperAdminUser } from '@/types'
import { cn } from '@/lib/utils'

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  TECHNICIAN: 'Technician',
  STOCK_STAFF: 'Stock',
}

const ROLE_COLORS: Record<string, string> = {
  OWNER:      'text-violet-400 bg-violet-500/10',
  MANAGER:    'text-blue-400 bg-blue-500/10',
  CASHIER:    'text-slate-400 bg-slate-500/10',
  TECHNICIAN: 'text-emerald-400 bg-emerald-500/10',
  STOCK_STAFF:'text-amber-400 bg-amber-500/10',
}

const ROLES = ['', 'OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF'] as const

export default function UsersPage() {
  const [search, setSearch] = useState('')
  const [role, setRole]     = useState('')

  const { data: statsData } = useQuery<{
    total: number; active: number; owners: number; managers: number; activeToday: number
  }>({
    queryKey: ['sa-users-stats'],
    queryFn: () => api.get('/super-admin/users/stats').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data, isLoading, isError } = useQuery<{ data: SuperAdminUser[]; total: number }>({
    queryKey: ['sa-users', search, role],
    queryFn: () =>
      api.get('/super-admin/users', {
        params: {
          search: search || undefined,
          role: role || undefined,
        },
      }).then((r) => r.data),
    refetchInterval: 60_000,
  })

  const users = data?.data ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">ผู้ใช้งานทั้งหมด</h1>
        <p className="text-slate-400 text-sm mt-0.5">รวม User ทุกคนจากทุก Tenant ในแพลตฟอร์ม</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <SuperAdminStatCard label="Total Users"  value={statsData?.total ?? '—'}      icon={Users}     accent="violet" />
        <SuperAdminStatCard label="Owners"       value={statsData?.owners ?? '—'}     icon={Shield}    accent="amber" />
        <SuperAdminStatCard label="Active Today" value={statsData?.activeToday ?? '—'} icon={UserCheck} accent="emerald" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ, อีเมล..."
            className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 text-sm rounded-xl"
          />
        </div>
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 flex-wrap">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                role === r ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-slate-300',
              )}
            >
              {r ? (ROLE_LABELS[r] ?? r) : 'ทั้งหมด'}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-violet-400" />
            <p className="text-white font-semibold text-sm">All Users</p>
          </div>
          {data && <span className="text-slate-500 text-xs">{data.total} users</span>}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : isError ? (
          <div className="py-12 text-center">
            <p className="text-red-400 text-sm">โหลดข้อมูลไม่สำเร็จ</p>
          </div>
        ) : users.length === 0 ? (
          <SuperAdminEmptyState
            icon={Users}
            title="ไม่พบผู้ใช้"
            description={search || role ? 'ลองเปลี่ยนตัวกรอง' : 'ยังไม่มีผู้ใช้ในระบบ'}
          />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">ชื่อ / อีเมล</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">Role</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden md:table-cell">Tenant</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden lg:table-cell">Branch</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">สถานะ</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide hidden xl:table-cell">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-5">
                    <p className="text-white font-medium">{u.name}</p>
                    <p className="text-slate-500 text-xs">{u.email}</p>
                  </td>
                  <td className="py-3.5 px-5">
                    <span className={cn(
                      'text-xs font-semibold px-2 py-1 rounded-lg',
                      ROLE_COLORS[u.role] ?? 'text-slate-400 bg-slate-800',
                    )}>
                      {ROLE_LABELS[u.role] ?? u.role}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 hidden md:table-cell">
                    <span className="text-slate-300 text-sm">
                      {u.tenant?.shopName ?? <span className="text-slate-600">—</span>}
                    </span>
                  </td>
                  <td className="py-3.5 px-5 hidden lg:table-cell">
                    <span className="text-slate-400 text-sm">
                      {u.branch?.name ?? <span className="text-slate-600">—</span>}
                    </span>
                  </td>
                  <td className="py-3.5 px-5">
                    {u.isActive ? (
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span className="text-emerald-400 text-xs">Active</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <XCircle className="h-3.5 w-3.5 text-slate-600" />
                        <span className="text-slate-500 text-xs">Inactive</span>
                      </div>
                    )}
                  </td>
                  <td className="py-3.5 px-5 hidden xl:table-cell">
                    <span className="text-slate-500 text-xs">
                      {u.lastLoginAt
                        ? format(new Date(u.lastLoginAt), 'd MMM yyyy HH:mm', { locale: th })
                        : '—'}
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
