'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Pencil, X,
  ArrowRightLeft, Check, Package, Users, ShoppingCart,
  Star, StarOff, AlertCircle, Search, ShieldCheck, ShieldX, Clock,
} from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import api from '@/lib/api'
import type { Branch, BranchStatus, BranchStock } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'branches' | 'stock'

// ── Helpers ───────────────────────────────────────────────────────────────────

const BRANCH_STATUS_CFG: Record<BranchStatus, { label: string; cls: string; icon: React.ElementType }> = {
  ACTIVE:           { label: 'ใช้งาน',        cls: 'bg-green-100 text-green-700',   icon: Check },
  PENDING_APPROVAL: { label: 'รอการอนุมัติ',   cls: 'bg-amber-100 text-amber-700',   icon: Clock },
  SUSPENDED:        { label: 'ระงับการใช้งาน', cls: 'bg-orange-100 text-orange-700', icon: AlertCircle },
  REJECTED:         { label: 'ถูกปฏิเสธ',      cls: 'bg-red-100 text-red-600',       icon: ShieldX },
}

function BranchStatusBadge({ status, isActive }: { status?: BranchStatus; isActive: boolean }) {
  if (!status || status === 'ACTIVE') {
    return (
      <span className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        isActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500',
      )}>
        {isActive ? 'ใช้งาน' : 'ปิดแล้ว'}
      </span>
    )
  }
  const cfg = BRANCH_STATUS_CFG[status]
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

// ── Branch Form Modal ─────────────────────────────────────────────────────────

function BranchModal({
  branch,
  onClose,
  onSave,
}: {
  branch?: Branch
  onClose: () => void
  onSave: (data: { name: string; address?: string; phone?: string; isDefault?: boolean }) => void
}) {
  const [name, setName]           = useState(branch?.name ?? '')
  const [address, setAddress]     = useState(branch?.address ?? '')
  const [phone, setPhone]         = useState(branch?.phone ?? '')
  const [isDefault, setIsDefault] = useState(branch?.isDefault ?? false)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    onSave({ name: name.trim(), address: address.trim() || undefined, phone: phone.trim() || undefined, isDefault })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between border-b dark:border-slate-700/60 px-6 py-4">
          <h2 className="font-semibold text-lg dark:text-white">{branch ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ชื่อสาขา *</label>
            <input
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/60 dark:bg-[#1E293B] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น สาขาสยาม"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">ที่อยู่</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/60 dark:bg-[#1E293B] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="ที่อยู่สาขา"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">เบอร์โทร</label>
            <input
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700/60 dark:bg-[#1E293B] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="02-xxx-xxxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="rounded"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">ตั้งเป็นสาขาหลัก</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              บันทึก
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const router = useRouter()
  const qc     = useQueryClient()
  const role   = useAuthStore((s) => s.user?.role)
  const hasPerm = useAuthStore((s) => s.hasPermission)
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const [tab, setTab]               = useState<Tab>('branches')
  const [showForm, setShowForm]     = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | undefined>()
  const [selectedBranchForStock, setSelectedBranchForStock] = useState<string>('')
  const [stockSearch, setStockSearch] = useState('')
  const [error, setError]           = useState('')
  const [rejectDialog,     setRejectDialog]     = useState<{ id: string; name: string } | null>(null)
  const [suspendDialog,    setSuspendDialog]    = useState<{ id: string; name: string } | null>(null)
  const [deactivateDialog, setDeactivateDialog] = useState<{ id: string; name: string } | null>(null)
  const [reasonInput, setReasonInput]           = useState('')

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: branches = [], isLoading } = useQuery<Branch[]>({
    queryKey: ['branches', true],
    queryFn: async () => (await api.get('/branches?includeInactive=true')).data,
    staleTime: 60_000,
  })

  const { data: branchStock = [] } = useQuery<BranchStock[]>({
    queryKey: ['branch-stock', selectedBranchForStock, stockSearch],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (stockSearch) params.set('search', stockSearch)
      return (await api.get(`/branches/${selectedBranchForStock}/stock?${params}`)).data
    },
    enabled: !!selectedBranchForStock && tab === 'stock',
    staleTime: 30_000,
  })

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: any) => api.post('/branches', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setShowForm(false); setError('') },
    onError: (e: any) => setError(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.patch(`/branches/${id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); setEditBranch(undefined); setError('') },
    onError: (e: any) => setError(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const deactivateMut = useMutation({
    mutationFn: (id: string) => api.delete(`/branches/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branches'] }),
    onError: (e: any) => setError(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(`/branches/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); toast.success('อนุมัติสาขาเรียบร้อย') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/branches/${id}/reject`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); toast.success('ปฏิเสธสาขาเรียบร้อย') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const suspendMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/branches/${id}/suspend`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['branches'] }); toast.success('ระงับสาขาเรียบร้อย') },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  // ── Guard ────────────────────────────────────────────────────────────────────

  if (!hasPerm('branches.manage')) {
    router.replace('/403')
    return null
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const activeBranches = branches.filter((b) => b.isActive)
  const pendingBranches = branches.filter((b) => b.status === 'PENDING_APPROVAL')

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title="จัดการสาขา"
        icon={Building2}
        subtitle={`${activeBranches.length} สาขาที่ใช้งาน${pendingBranches.length > 0 ? ` · ${pendingBranches.length} รอการอนุมัติ` : ''}`}
        primaryAction={
          tab === 'branches' ? (
            <button
              onClick={() => { setEditBranch(undefined); setShowForm(true) }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">เพิ่มสาขา</span>
            </button>
          ) : undefined
        }
      />

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto" onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-700/60 rounded-lg p-1">
        {([
          { id: 'branches', label: 'สาขา', icon: Building2 },
          { id: 'stock',    label: 'สต็อกสาขา', icon: Package },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-2 text-sm font-medium transition-all',
              tab === t.id ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200',
            )}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
        <Link
          href="/transfers"
          className="flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-2 text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/70 transition-all"
        >
          <ArrowRightLeft className="h-4 w-4" />
          <span className="hidden sm:inline">โอนสต็อก</span>
        </Link>
      </div>

      {/* ── Branches Tab ── */}
      {tab === 'branches' && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
          ) : branches.length === 0 ? (
            <EmptyState preset="default" icon={Building2} title="ยังไม่มีสาขา" description="กดปุ่มเพิ่มสาขาเพื่อเริ่มต้น" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className={cn(
                    'rounded-xl border bg-white dark:bg-[#1E293B] p-4 space-y-2 transition-all',
                    branch.isActive ? 'border-slate-200 dark:border-slate-700/60' : 'border-slate-100 dark:border-slate-700/60 opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {branch.isDefault && (
                        <Star className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-900 dark:text-white truncate">{branch.name}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
                      <BranchStatusBadge status={branch.status} isActive={branch.isActive} />
                      <button
                        onClick={() => { setEditBranch(branch); setShowForm(true) }}
                        className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5 text-slate-500" />
                      </button>
                      {isSuperAdmin && branch.status === 'PENDING_APPROVAL' && (
                        <>
                          <button
                            onClick={() => approveMut.mutate(branch.id)}
                            className="flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-green-700"
                            title="อนุมัติสาขา"
                          >
                            <ShieldCheck className="h-3 w-3" />
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => { setReasonInput(''); setRejectDialog({ id: branch.id, name: branch.name }) }}
                            className="flex items-center gap-1 rounded-lg border border-red-300 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-50"
                            title="ปฏิเสธสาขา"
                          >
                            <ShieldX className="h-3 w-3" />
                            ปฏิเสธ
                          </button>
                        </>
                      )}
                      {isSuperAdmin && branch.status === 'ACTIVE' && !branch.isDefault && (
                        <button
                          onClick={() => { setReasonInput(''); setSuspendDialog({ id: branch.id, name: branch.name }) }}
                          className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                          title="ระงับสาขา"
                        >
                          <AlertCircle className="h-3.5 w-3.5 text-orange-400" />
                        </button>
                      )}
                      {!branch.isDefault && branch.isActive && (
                        <button
                          onClick={() => setDeactivateDialog({ id: branch.id, name: branch.name })}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                        >
                          <StarOff className="h-3.5 w-3.5 text-red-400" />
                        </button>
                      )}
                    </div>
                  </div>
                  {branch.branchNumber != null && (
                    <p className="text-xs text-slate-400 font-mono">สาขา #{branch.branchNumber}</p>
                  )}
                  {branch.address && (
                    <p className="text-xs text-slate-500 line-clamp-1">{branch.address}</p>
                  )}
                  {branch.phone && (
                    <p className="text-xs text-slate-500">{branch.phone}</p>
                  )}
                  {branch.status === 'PENDING_APPROVAL' && (
                    <p className="text-xs font-medium text-amber-600">⚠ สาขานี้รอการอนุมัติจาก SUPER ADMIN</p>
                  )}
                  {branch.status === 'SUSPENDED' && (
                    <p className="text-xs font-medium text-orange-600">⚠ สาขานี้ถูกระงับการใช้งาน</p>
                  )}
                  <div className="flex gap-3 pt-1 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/60">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {branch._count?.users ?? 0} พนักงาน
                    </span>
                    <span className="flex items-center gap-1">
                      <ShoppingCart className="h-3 w-3" />
                      {branch._count?.sales ?? 0} บิล
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Stock Tab ── */}
      {tab === 'stock' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              className="rounded-lg border border-slate-300 dark:border-slate-700/60 dark:bg-[#1E293B] dark:text-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={selectedBranchForStock}
              onChange={(e) => setSelectedBranchForStock(e.target.value)}
            >
              <option value="">เลือกสาขา</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
            {selectedBranchForStock && (
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700/60 dark:bg-[#1E293B] dark:text-white pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ค้นหาสินค้า..."
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                />
              </div>
            )}
          </div>

          {!selectedBranchForStock ? (
            <div className="text-center py-12 text-slate-400">
              <Package className="h-10 w-10 mx-auto mb-2 opacity-40" />
              เลือกสาขาเพื่อดูสต็อก
              <p className="text-xs mt-1 text-amber-500">⚠ สต็อกแสดงเฉพาะสาขาที่เลือก — ไม่ใช่รวมทุกสาขา</p>
            </div>
          ) : branchStock.length === 0 ? (
            <EmptyState preset="stock" title="ยังไม่มีข้อมูลสต็อก" description="ไม่มีข้อมูลสต็อกสำหรับสาขานี้" />
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] overflow-hidden">
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 font-medium flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                สต็อกเฉพาะสาขา — {branches.find(b => b.id === selectedBranchForStock)?.name}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700/60">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">สินค้า</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 hidden md:table-cell">รหัสสต็อก</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400">คงเหลือ</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 hidden sm:table-cell">ขั้นต่ำ</th>
                    <th className="text-right px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 hidden sm:table-cell">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {branchStock.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-white">{s.product?.name}</div>
                        <div className="text-xs text-slate-500">{s.product?.sku}</div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        {s.stockCode
                          ? <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700">{s.stockCode}</code>
                          : <span className="text-xs text-slate-300">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">
                        <span className={cn(s.quantity <= s.minStock && s.minStock > 0 ? 'text-red-600' : 'text-slate-900')}>
                          {s.quantity}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500 hidden sm:table-cell">{s.minStock}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell">
                        {s.quantity <= s.minStock && s.minStock > 0 ? (
                          <span className="text-xs font-medium text-red-600">สต็อกต่ำ</span>
                        ) : (
                          <span className="text-xs font-medium text-green-600">ปกติ</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showForm && (
        <BranchModal
          branch={editBranch}
          onClose={() => { setShowForm(false); setEditBranch(undefined) }}
          onSave={(data) => {
            if (editBranch) {
              updateMut.mutate({ id: editBranch.id, data })
            } else {
              createMut.mutate(data)
            }
          }}
        />
      )}

      {/* Reject / Suspend reason dialog */}
      {(rejectDialog || suspendDialog) && (() => {
        const isReject = !!rejectDialog
        const target   = rejectDialog ?? suspendDialog!
        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-xl w-full max-w-sm p-6 space-y-4">
              <h3 className="font-bold text-slate-900 dark:text-white">
                {isReject ? 'ปฏิเสธสาขา' : 'ระงับสาขา'}: {target.name}
              </h3>
              <textarea
                rows={3}
                placeholder="ระบุเหตุผล..."
                value={reasonInput}
                onChange={(e) => setReasonInput(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 dark:text-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setRejectDialog(null); setSuspendDialog(null) }}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 dark:text-slate-300"
                >ยกเลิก</button>
                <button
                  disabled={!reasonInput.trim()}
                  onClick={() => {
                    if (!reasonInput.trim()) return
                    if (isReject) rejectMut.mutate({ id: target.id, reason: reasonInput })
                    else suspendMut.mutate({ id: target.id, reason: reasonInput })
                    setRejectDialog(null); setSuspendDialog(null)
                  }}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-40"
                >{isReject ? 'ปฏิเสธ' : 'ระงับ'}</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Deactivate confirm dialog */}
      {deactivateDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-slate-900 dark:text-white">ปิดใช้งานสาขา</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              ยืนยันปิดใช้งานสาขา <span className="font-semibold">"{deactivateDialog.name}"</span>?
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeactivateDialog(null)}
                className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40 dark:text-slate-300"
              >ยกเลิก</button>
              <button
                onClick={() => { deactivateMut.mutate(deactivateDialog.id); setDeactivateDialog(null) }}
                className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700"
              >ปิดใช้งาน</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
