'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  GitBranch, Settings2, Bell, CheckCircle2, AlertTriangle,
  Loader2, ShieldAlert, RefreshCw, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Summary {
  orphanBranches:      number
  orphanShopSettings:  number
  orphanNotifications: number
  tenants:             number
}

interface TenantOption {
  id:       string
  shopName: string
  email:    string
  status:   string
}

interface OrphanBranch {
  id:        string
  name:      string
  isActive:  boolean
  status:    string
  createdAt: string
}

interface OrphanSettings {
  id:        number
  shopName:  string
  updatedAt: string
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  open, title, description, onConfirm, onCancel, loading,
}: {
  open: boolean
  title: string
  description: string
  onConfirm: () => void
  onCancel: () => void
  loading: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-white font-semibold">{title}</h3>
            <p className="text-slate-400 text-sm mt-1">{description}</p>
          </div>
        </div>
        <p className="text-xs text-slate-500 mb-4">การดำเนินการนี้จะถูกบันทึกใน Audit Log</p>
        <div className="flex gap-3 justify-end">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}
            className="border-slate-600 text-slate-300 hover:bg-slate-700">
            ยกเลิก
          </Button>
          <Button size="sm" onClick={onConfirm} disabled={loading}
            className="bg-amber-500 hover:bg-amber-600 text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ยืนยัน'}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Tenant Select ─────────────────────────────────────────────────────────────

function TenantSelect({
  tenants, value, onChange,
}: {
  tenants: TenantOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full appearance-none bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-violet-500 pr-8"
      >
        <option value="">-- เลือก Tenant --</option>
        {tenants.map(t => (
          <option key={t.id} value={t.id}>
            {t.shopName} ({t.email})
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
    </div>
  )
}

// ── Summary Card ──────────────────────────────────────────────────────────────

function SummaryCard({
  icon: Icon, label, count, accent, description,
}: {
  icon: React.ElementType
  label: string
  count: number
  accent: string
  description: string
}) {
  const colors: Record<string, string> = {
    amber:  'bg-amber-500/10 text-amber-400 border-amber-500/20',
    red:    'bg-red-500/10   text-red-400   border-red-500/20',
    blue:   'bg-blue-500/10  text-blue-400  border-blue-500/20',
    green:  'bg-green-500/10 text-green-400 border-green-500/20',
  }
  return (
    <div className={cn('rounded-xl border p-4', colors[accent])}>
      <div className="flex items-center gap-3">
        <Icon className="h-5 w-5 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-medium opacity-70">{label}</p>
          <p className="text-2xl font-bold">{count}</p>
          <p className="text-xs opacity-60 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DataRepairPage() {
  const qc = useQueryClient()

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading, refetch: refetchSummary } =
    useQuery<Summary>({
      queryKey: ['sa-data-repair-summary'],
      queryFn:  () => api.get('/super-admin/data-repair/summary').then(r => r.data),
    })

  const { data: tenants = [] } = useQuery<TenantOption[]>({
    queryKey: ['sa-data-repair-tenants'],
    queryFn:  () => api.get('/super-admin/data-repair/tenants').then(r => r.data),
  })

  const { data: orphanBranchData, isLoading: branchLoading } =
    useQuery<{ items: OrphanBranch[]; total: number }>({
      queryKey: ['sa-orphan-branches'],
      queryFn:  () => api.get('/super-admin/data-repair/orphan-branches').then(r => r.data),
    })

  const { data: orphanSettings = [] } = useQuery<OrphanSettings[]>({
    queryKey: ['sa-orphan-shop-settings'],
    queryFn:  () => api.get('/super-admin/data-repair/orphan-shop-settings').then(r => r.data),
  })

  // ── Local state ───────────────────────────────────────────────────────────
  const [branchTenants,  setBranchTenants]  = useState<Record<string, string>>({})
  const [settingTenants, setSettingTenants] = useState<Record<number, string>>({})
  const [notifTenantId,  setNotifTenantId]  = useState('')

  const [confirm, setConfirm] = useState<{
    open: boolean; title: string; desc: string; onConfirm: () => void
  }>({ open: false, title: '', desc: '', onConfirm: () => {} })

  // ── Mutations ─────────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['sa-data-repair-summary'] })
    qc.invalidateQueries({ queryKey: ['sa-orphan-branches'] })
    qc.invalidateQueries({ queryKey: ['sa-orphan-shop-settings'] })
  }

  const assignBranch = useMutation({
    mutationFn: ({ branchId, tenantId }: { branchId: string; tenantId: string }) =>
      api.patch(`/super-admin/data-repair/branches/${branchId}/assign-tenant`, { tenantId }),
    onSuccess: () => { invalidate(); setConfirm(c => ({ ...c, open: false })) },
  })

  const assignSettings = useMutation({
    mutationFn: ({ id, tenantId }: { id: number; tenantId: string }) =>
      api.patch(`/super-admin/data-repair/shop-settings/${id}/assign-tenant`, { tenantId }),
    onSuccess: () => { invalidate(); setConfirm(c => ({ ...c, open: false })) },
  })

  const assignNotifications = useMutation({
    mutationFn: ({ tenantId }: { tenantId: string }) =>
      api.post('/super-admin/data-repair/assign-orphan-notifications', { tenantId }),
    onSuccess: () => { invalidate(); setConfirm(c => ({ ...c, open: false })) },
  })

  const anyLoading = assignBranch.isPending || assignSettings.isPending || assignNotifications.isPending

  // ── Helpers ───────────────────────────────────────────────────────────────
  const openConfirm = (title: string, desc: string, onConfirm: () => void) =>
    setConfirm({ open: true, title, desc, onConfirm })

  const tenantName = (id: string) => tenants.find(t => t.id === id)?.shopName ?? id

  const orphanBranches = orphanBranchData?.items ?? []

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Data Repair</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            ตรวจหาและแก้ไข record ที่ tenantId หายหรือผิด
          </p>
        </div>
        <Button variant="outline" size="sm"
          onClick={() => refetchSummary()}
          className="border-slate-600 text-slate-300 hover:bg-slate-700 gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </Button>
      </div>

      {/* Summary Cards */}
      {summaryLoading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard icon={GitBranch} label="Orphan Branches"
            count={summary?.orphanBranches ?? 0} accent="amber"
            description="Branch ที่ยังไม่มี Tenant" />
          <SummaryCard icon={Settings2} label="Orphan ShopSettings"
            count={summary?.orphanShopSettings ?? 0} accent="red"
            description="Settings ที่ไม่ผูกกับร้านใด" />
          <SummaryCard icon={Bell} label="Orphan Notifications"
            count={summary?.orphanNotifications ?? 0} accent="blue"
            description="แจ้งเตือนที่ไม่มี Tenant" />
          <SummaryCard icon={CheckCircle2} label="Tenants ทั้งหมด"
            count={summary?.tenants ?? 0} accent="green"
            description="จำนวนร้านในระบบ" />
        </div>
      )}

      {/* ── Orphan Branches ── */}
      <section className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-amber-400" />
          <h2 className="font-semibold text-white">Orphan Branches</h2>
          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-xs ml-auto">
            {orphanBranchData?.total ?? 0} รายการ
          </Badge>
        </div>

        {branchLoading ? (
          <div className="p-5 text-slate-400 text-sm flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด...
          </div>
        ) : orphanBranches.length === 0 ? (
          <div className="p-5 text-center text-slate-500 text-sm">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            ไม่มี Orphan Branch
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {orphanBranches.map(branch => (
              <div key={branch.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{branch.name}</p>
                  <p className="text-slate-500 text-xs">
                    {branch.status} · {new Date(branch.createdAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="w-56 shrink-0">
                  <TenantSelect
                    tenants={tenants}
                    value={branchTenants[branch.id] ?? ''}
                    onChange={v => setBranchTenants(p => ({ ...p, [branch.id]: v }))}
                  />
                </div>
                <Button size="sm" disabled={!branchTenants[branch.id] || anyLoading}
                  className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                  onClick={() => {
                    const tid = branchTenants[branch.id]
                    openConfirm(
                      'Assign Branch ไป Tenant',
                      `Assign "${branch.name}" ไปยัง "${tenantName(tid)}"?`,
                      () => assignBranch.mutate({ branchId: branch.id, tenantId: tid }),
                    )
                  }}>
                  Assign
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Orphan ShopSettings ── */}
      <section className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-red-400" />
          <h2 className="font-semibold text-white">Orphan ShopSettings</h2>
          <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs ml-auto">
            {orphanSettings.length} รายการ
          </Badge>
        </div>

        {orphanSettings.length === 0 ? (
          <div className="p-5 text-center text-slate-500 text-sm">
            <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
            ไม่มี Orphan ShopSettings
          </div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {orphanSettings.map(s => (
              <div key={s.id} className="px-5 py-3 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium truncate">{s.shopName}</p>
                  <p className="text-slate-500 text-xs">
                    id: {s.id} · อัปเดต {new Date(s.updatedAt).toLocaleDateString('th-TH')}
                  </p>
                </div>
                <div className="w-56 shrink-0">
                  <TenantSelect
                    tenants={tenants}
                    value={settingTenants[s.id] ?? ''}
                    onChange={v => setSettingTenants(p => ({ ...p, [s.id]: v }))}
                  />
                </div>
                <Button size="sm" disabled={!settingTenants[s.id] || anyLoading}
                  className="bg-red-500 hover:bg-red-600 text-white shrink-0"
                  onClick={() => {
                    const tid = settingTenants[s.id]
                    openConfirm(
                      'Assign ShopSettings ไป Tenant',
                      `Assign settings "${s.shopName}" ไปยัง "${tenantName(tid)}"?`,
                      () => assignSettings.mutate({ id: s.id, tenantId: tid }),
                    )
                  }}>
                  Assign
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Orphan Notifications ── */}
      <section className="bg-slate-800/60 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
          <Bell className="h-4 w-4 text-blue-400" />
          <h2 className="font-semibold text-white">Orphan Notifications</h2>
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs ml-auto">
            {summary?.orphanNotifications ?? 0} รายการ
          </Badge>
        </div>

        <div className="p-5 space-y-4">
          {(summary?.orphanNotifications ?? 0) === 0 ? (
            <div className="text-center text-slate-500 text-sm">
              <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
              ไม่มี Orphan Notification
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                พบ {summary?.orphanNotifications} notification ที่ไม่มี tenantId —
                เลือก Tenant เพื่อ assign ทั้งหมด (bulk)
              </div>
              <div className="flex items-center gap-3">
                <div className="flex-1 max-w-xs">
                  <TenantSelect
                    tenants={tenants}
                    value={notifTenantId}
                    onChange={setNotifTenantId}
                  />
                </div>
                <Button size="sm" disabled={!notifTenantId || anyLoading}
                  className="bg-blue-500 hover:bg-blue-600 text-white"
                  onClick={() => {
                    const tid = notifTenantId
                    openConfirm(
                      'Assign Notifications ทั้งหมด',
                      `Assign ${summary?.orphanNotifications} orphan notification ไปยัง "${tenantName(tid)}"?`,
                      () => assignNotifications.mutate({ tenantId: tid }),
                    )
                  }}>
                  {anyLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Bulk Assign'}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        description={confirm.desc}
        loading={anyLoading}
        onConfirm={confirm.onConfirm}
        onCancel={() => setConfirm(c => ({ ...c, open: false }))}
      />
    </div>
  )
}
