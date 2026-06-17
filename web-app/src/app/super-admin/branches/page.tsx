'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch, Building2, Search, Loader2,
  AlertTriangle, ShieldAlert, ChevronDown, RefreshCw, Users,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Branch {
  id: string
  name: string
  address?: string | null
  isActive: boolean
  status: string
  createdAt: string
  tenantId?: string | null
  tenant?: { id: string; shopName: string } | null
  _count: { users: number; repairs: number; sales: number }
}

interface TenantOption {
  id: string
  shopName: string
  status: string
}

interface ReassignPreview {
  branch: { id: string; name: string; currentTenantId: string | null; currentTenant: TenantOption | null }
  targetTenant: TenantOption
  impact: { users: number; repairs: number; sales: number; expenses: number; notifications: number }
}

// ── Helper components ─────────────────────────────────────────────────────────

function BranchStatusDot({ isActive, status }: { isActive: boolean; status: string }) {
  if (!isActive || status === 'SUSPENDED') return <span className="inline-flex h-2 w-2 rounded-full bg-orange-500" />
  if (status === 'PENDING_APPROVAL') return <span className="inline-flex h-2 w-2 rounded-full bg-amber-500" />
  return <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
}

function TenantSelect({
  tenants, value, onChange, placeholder = '-- เลือก Tenant --',
}: {
  tenants: TenantOption[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 pr-8"
      >
        <option value="">{placeholder}</option>
        {tenants.map(t => (
          <option key={t.id} value={t.id}>{t.shopName}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ── Reassign Dialog ───────────────────────────────────────────────────────────

function ReassignDialog({
  branch,
  tenants,
  onClose,
  onSuccess,
}: {
  branch: Branch
  tenants: TenantOption[]
  onClose: () => void
  onSuccess: () => void
}) {
  const qc = useQueryClient()
  const [selectedTenantId, setSelectedTenantId] = useState('')
  const [updateRelatedData, setUpdateRelatedData] = useState(true)
  const [step, setStep] = useState<'select' | 'preview' | 'confirm'>('select')

  const { data: preview, isFetching: previewLoading, refetch: fetchPreview } =
    useQuery<ReassignPreview>({
      queryKey: ['branch-reassign-preview', branch.id, selectedTenantId],
      queryFn: () =>
        api.get(`/super-admin/branches/${branch.id}/reassign-preview`, {
          params: { tenantId: selectedTenantId },
        }).then(r => r.data),
      enabled: false,
    })

  const { mutate: doReassign, isPending: reassigning } = useMutation({
    mutationFn: () =>
      api.patch(`/super-admin/branches/${branch.id}/reassign-tenant`, {
        tenantId: selectedTenantId,
        updateRelatedData,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['sa-branches'] })
      qc.invalidateQueries({ queryKey: ['sa-branches-stats'] })
      onSuccess()
      onClose()
    },
  })

  const handlePreview = async () => {
    if (!selectedTenantId) return
    setStep('preview')
    fetchPreview()
  }

  const impactRow = (label: string, count: number) => (
    <div className="flex items-center justify-between py-1.5 border-b border-slate-700/50 last:border-0">
      <span className="text-slate-400 text-sm">{label}</span>
      <span className={cn('text-sm font-semibold', count > 0 ? 'text-amber-400' : 'text-slate-500')}>
        {count} รายการ
      </span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-lg shadow-2xl">
        <div className="flex items-start gap-3 mb-5">
          <RefreshCw className="h-5 w-5 text-violet-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-white font-semibold">ย้ายสาขาไปยัง Tenant</h3>
            <p className="text-slate-400 text-sm mt-0.5">
              สาขา: <span className="text-white font-medium">{branch.name}</span>
              {branch.tenant && (
                <> · จาก: <span className="text-slate-300">{branch.tenant.shopName}</span></>
              )}
            </p>
          </div>
        </div>

        {step === 'select' && (
          <div className="space-y-4">
            <div>
              <label className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-1.5 block">
                เลือก Tenant ปลายทาง
              </label>
              <TenantSelect
                tenants={tenants.filter(t => t.id !== branch.tenantId)}
                value={selectedTenantId}
                onChange={setSelectedTenantId}
              />
            </div>
            <div className="flex gap-3 justify-end mt-2">
              <Button variant="outline" size="sm" onClick={onClose}
                className="border-slate-600 text-slate-300 hover:bg-slate-700">
                ยกเลิก
              </Button>
              <Button size="sm" onClick={handlePreview} disabled={!selectedTenantId}
                className="bg-violet-600 hover:bg-violet-500 text-white">
                ดู Preview
              </Button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-4">
            {previewLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : preview ? (
              <>
                <div className="bg-slate-900 rounded-lg p-4 space-y-1">
                  <p className="text-slate-400 text-xs font-medium uppercase tracking-wide mb-3">ผลกระทบ</p>
                  {impactRow('Users', preview.impact.users)}
                  {impactRow('งานซ่อม (Repairs)', preview.impact.repairs)}
                  {impactRow('การขาย (Sales)', preview.impact.sales)}
                  {impactRow('ค่าใช้จ่าย (Expenses)', preview.impact.expenses)}
                  {impactRow('Notifications', preview.impact.notifications)}
                </div>

                <label className="flex items-start gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={updateRelatedData}
                    onChange={e => setUpdateRelatedData(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-700 accent-violet-500"
                  />
                  <div>
                    <p className="text-white text-sm font-medium group-hover:text-violet-300 transition-colors">
                      อัปเดต tenantId ของ Users ในสาขานี้ด้วย
                    </p>
                    <p className="text-slate-500 text-xs mt-0.5">
                      ผู้ใช้ {preview.impact.users} คนจะถูกโอนไปยัง {preview.targetTenant.shopName}
                    </p>
                  </div>
                </label>

                <p className="text-xs text-slate-500">
                  การดำเนินการนี้จะถูกบันทึกใน Audit Log
                </p>

                <div className="flex gap-3 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setStep('select')}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700">
                    กลับ
                  </Button>
                  <Button size="sm" onClick={() => setStep('confirm')}
                    className="bg-amber-500 hover:bg-amber-600 text-white">
                    ดำเนินการ
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-red-400 text-sm text-center py-6">โหลด Preview ไม่สำเร็จ</p>
            )}
          </div>
        )}

        {step === 'confirm' && preview && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
              <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-amber-300 font-medium text-sm">ยืนยันการย้ายสาขา</p>
                <p className="text-amber-400/80 text-xs mt-1">
                  สาขา <strong>{branch.name}</strong> จะถูกย้ายไปยัง{' '}
                  <strong>{preview.targetTenant.shopName}</strong>
                  {updateRelatedData && ` พร้อม Users ${preview.impact.users} คน`}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setStep('preview')}
                className="border-slate-600 text-slate-300 hover:bg-slate-700"
                disabled={reassigning}>
                กลับ
              </Button>
              <Button size="sm" onClick={() => doReassign()} disabled={reassigning}
                className="bg-amber-500 hover:bg-amber-600 text-white">
                {reassigning ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยัน'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const [search, setSearch] = useState('')
  const [orphanOnly, setOrphanOnly] = useState(false)
  const [reassignTarget, setReassignTarget] = useState<Branch | null>(null)
  const [successMsg, setSuccessMsg] = useState('')

  const { data: statsData } = useQuery<{ total: number; active: number; suspended: number; orphan: number }>({
    queryKey: ['sa-branches-stats'],
    queryFn: () => api.get('/super-admin/branches/stats').then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data, isLoading, isError } = useQuery<{ data: Branch[]; total: number }>({
    queryKey: ['sa-branches', search, orphanOnly],
    queryFn: () =>
      api.get('/super-admin/branches', {
        params: { search: search || undefined, orphanOnly: orphanOnly ? 'true' : undefined },
      }).then(r => r.data),
    refetchInterval: 60_000,
  })

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ['sa-tenants-list'],
    queryFn: () =>
      api.get('/super-admin/tenants').then(r =>
        (r.data.data ?? []).map((t: any) => ({ id: t.id, shopName: t.shopName, status: t.status }))
      ),
  })

  const branches = data?.data ?? []

  return (
    <div className="space-y-6">
      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-4 py-3 text-emerald-400 text-sm flex items-center gap-2">
          <span>✓</span> {successMsg}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">สาขาทั้งหมด</h1>
          <p className="text-slate-400 text-sm mt-0.5">รวมสาขาจากทุก Tenant ในแพลตฟอร์ม</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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
        <SuperAdminStatCard
          label="Orphan"
          value={statsData?.orphan ?? '—'}
          icon={Users}
          accent="red"
          sub="ยังไม่ผูก Tenant"
        />
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาสาขา..."
            className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 text-sm rounded-xl"
          />
        </div>
        <button
          onClick={() => setOrphanOnly(v => !v)}
          className={cn(
            'px-4 py-2 rounded-xl text-sm font-medium border transition-colors',
            orphanOnly
              ? 'bg-red-500/20 border-red-500/40 text-red-300'
              : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700',
          )}
        >
          {orphanOnly ? '✓ แสดงเฉพาะ Orphan' : 'แสดงเฉพาะ Orphan'}
        </button>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-blue-400" />
            <p className="text-white font-semibold text-sm">
              {orphanOnly ? 'Orphan Branches' : 'All Branches'}
            </p>
          </div>
          {data && <span className="text-slate-500 text-xs">{data.total} สาขา</span>}
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
            description={search ? 'ลองค้นหาด้วยคำอื่น' : orphanOnly ? 'ไม่มีสาขาที่ยังไม่ผูก Tenant' : 'ยังไม่มีสาขาในระบบ'}
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
                <th className="py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide text-right">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.id} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                  <td className="py-3.5 px-5">
                    <p className="text-white font-medium">{b.name}</p>
                    {b.address && <p className="text-slate-500 text-xs mt-0.5">{b.address}</p>}
                  </td>
                  <td className="py-3.5 px-5 hidden md:table-cell">
                    {b.tenant ? (
                      <span className="text-slate-300 text-sm">{b.tenant.shopName}</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-red-400 text-xs font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />
                        Orphan
                      </span>
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
                  <td className="py-3.5 px-5 text-right">
                    <button
                      onClick={() => {
                        setSuccessMsg('')
                        setReassignTarget(b)
                      }}
                      className="text-xs px-2.5 py-1 rounded-lg bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/20 transition-colors"
                    >
                      Reassign
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {reassignTarget && (
        <ReassignDialog
          branch={reassignTarget}
          tenants={tenants}
          onClose={() => setReassignTarget(null)}
          onSuccess={() => setSuccessMsg(`ย้ายสาขา "${reassignTarget.name}" สำเร็จ`)}
        />
      )}
    </div>
  )
}
