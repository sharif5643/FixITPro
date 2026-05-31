'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2, Plus, Pencil, X, ChevronRight,
  ArrowRightLeft, Check, Package, Users, ShoppingCart,
  Star, StarOff, AlertCircle, Search, ShieldCheck, ShieldX, Clock,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import api from '@/lib/api'
import type { Branch, BranchStatus, BranchStock, StockTransfer, Product } from '@/types'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'
import { CheckCircle2, XCircle, Truck, PackageCheck } from 'lucide-react'

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab = 'branches' | 'stock' | 'transfers'

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

function TransferStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; cls: string }> = {
    PENDING:    { label: 'รออนุมัติ',      cls: 'bg-amber-100 text-amber-700' },
    APPROVED:   { label: 'อนุมัติแล้ว',    cls: 'bg-blue-100 text-blue-700' },
    REJECTED:   { label: 'ปฏิเสธ',         cls: 'bg-red-100 text-red-600' },
    IN_TRANSIT: { label: 'กำลังส่ง',       cls: 'bg-indigo-100 text-indigo-700' },
    RECEIVED:   { label: 'รับแล้ว',         cls: 'bg-green-100 text-green-700' },
    COMPLETED:  { label: 'เสร็จสิ้น',      cls: 'bg-green-100 text-green-700' },
    CANCELLED:  { label: 'ยกเลิก',          cls: 'bg-slate-100 text-slate-500' },
  }
  const { label, cls } = cfg[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>
      {label}
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
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="font-semibold text-lg">{branch ? 'แก้ไขสาขา' : 'เพิ่มสาขาใหม่'}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ชื่อสาขา *</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="เช่น สาขาสยาม"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">ที่อยู่</label>
            <textarea
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={2}
              placeholder="ที่อยู่สาขา"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">เบอร์โทร</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <span className="text-sm text-slate-700">ตั้งเป็นสาขาหลัก</span>
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

// ── Transfer Modal ────────────────────────────────────────────────────────────

function TransferModal({
  branches,
  onClose,
  onSave,
}: {
  branches: Branch[]
  onClose: () => void
  onSave: (data: { fromBranchId: string; toBranchId: string; productId: string; quantity: number; note?: string }) => void
}) {
  const [fromId, setFromId]   = useState('')
  const [toId, setToId]       = useState('')
  const [productId, setProductId] = useState('')
  const [qty, setQty]         = useState(1)
  const [note, setNote]       = useState('')
  const [search, setSearch]   = useState('')

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-active'],
    queryFn: async () => (await api.get('/products?isActive=true&limit=500')).data?.data ?? [],
    staleTime: 60_000,
    enabled: true,
  })

  const filtered = products.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()),
  ).slice(0, 50)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!fromId || !toId || !productId || qty < 1) return
    onSave({ fromBranchId: fromId, toBranchId: toId, productId, quantity: qty, note: note.trim() || undefined })
  }

  const activeBranches = branches.filter((b) => b.isActive)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b px-6 py-4 flex-shrink-0">
          <h2 className="font-semibold text-lg flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-blue-600" />
            โอนสต็อกระหว่างสาขา
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">จากสาขา *</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={fromId}
                onChange={(e) => setFromId(e.target.value)}
                required
              >
                <option value="">เลือกสาขา</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.id === toId}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">ไปยังสาขา *</label>
              <select
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={toId}
                onChange={(e) => setToId(e.target.value)}
                required
              >
                <option value="">เลือกสาขา</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id} disabled={b.id === fromId}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ค้นหาสินค้า</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="ชื่อ หรือ SKU"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              size={4}
              required
            >
              {filtered.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">จำนวน *</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={qty}
              onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">หมายเหตุ</label>
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="หมายเหตุ (ถ้ามี)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

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
              สร้างรายการโอน
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BranchesPage() {
  const qc   = useQueryClient()
  const role = useAuthStore((s) => s.user?.role)
  const isSuperAdmin = role === 'SUPER_ADMIN'

  const [tab, setTab]               = useState<Tab>('branches')
  const [showForm, setShowForm]     = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | undefined>()
  const [showTransfer, setShowTransfer] = useState(false)
  const [selectedBranchForStock, setSelectedBranchForStock] = useState<string>('')
  const [stockSearch, setStockSearch] = useState('')
  const [transferFilter, setTransferFilter] = useState<string>('ALL')
  const [error, setError]           = useState('')

  type TransferActionKind = 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel'
  type TransferAction = { kind: TransferActionKind; transfer: StockTransfer } | null
  const [transferAction, setTransferAction] = useState<TransferAction>(null)
  const closeTransferDialog = () => setTransferAction(null)

  function getTransferDialogConfig(kind: TransferActionKind) {
    switch (kind) {
      case 'approve':  return { title: 'ยืนยันอนุมัติคำขอโอน', description: 'ต้องการอนุมัติให้สาขาต้นทางจัดส่งสินค้านี้หรือไม่?', icon: CheckCircle2, variant: 'info' as const, confirmLabel: 'อนุมัติ' }
      case 'reject':   return { title: 'ปฏิเสธคำขอโอน', description: 'กรุณาระบุเหตุผลการปฏิเสธ', icon: XCircle, variant: 'danger' as const, confirmLabel: 'ปฏิเสธ', requireReason: true, reasonLabel: 'เหตุผลที่ปฏิเสธ', reasonPlaceholder: 'ระบุเหตุผล (ไม่บังคับ)...' }
      case 'dispatch': return { title: 'ยืนยันจัดส่งสินค้า', description: 'ยืนยันว่าได้ส่งสินค้าออกจากสาขาต้นทางแล้ว', icon: Truck, variant: 'info' as const, confirmLabel: 'จัดส่งแล้ว' }
      case 'receive':  return { title: 'ยืนยันรับสินค้า', description: 'เมื่อกดยืนยัน ระบบจะเพิ่มสต๊อกเข้าสาขาปลายทางและลดสต๊อกจากสาขาต้นทาง', icon: PackageCheck, variant: 'success' as const, confirmLabel: 'รับสินค้าแล้ว' }
      case 'cancel':   return { title: 'ยกเลิกคำขอโอน', description: 'ต้องการยกเลิกคำขอโอนนี้หรือไม่?', icon: XCircle, variant: 'warning' as const, confirmLabel: 'ยกเลิกคำขอ', requireReason: true, reasonLabel: 'เหตุผลที่ยกเลิก', reasonPlaceholder: 'ระบุเหตุผล...' }
    }
  }

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

  const { data: transfers = [] } = useQuery<StockTransfer[]>({
    queryKey: ['stock-transfers', transferFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (transferFilter !== 'ALL') params.set('status', transferFilter)
      return (await api.get(`/branches/transfers/list?${params}`)).data
    },
    enabled: tab === 'transfers',
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

  const transferMut = useMutation({
    mutationFn: (data: any) => api.post('/branches/transfers', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['branch-stock'] })
      setShowTransfer(false)
      setError('')
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const completeMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/complete`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['branch-stock'] })
    },
    onError: (e: any) => setError(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/branches/transfers/${id}/cancel`, { reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-transfers'] }); toast.success('ยกเลิกคำขอแล้ว'); closeTransferDialog() },
    onError: (e: any) => setError(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const approveTransferMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/approve`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-transfers'] }); toast.success('อนุมัติคำขอแล้ว'); closeTransferDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const rejectTransferMut = useMutation({
    mutationFn: ({ id, rejectReason }: { id: string; rejectReason?: string }) =>
      api.patch(`/branches/transfers/${id}/reject`, { rejectReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-transfers'] }); toast.success('ปฏิเสธคำขอแล้ว'); closeTransferDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const dispatchMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/dispatch`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['stock-transfers'] }); toast.success('จัดส่งสินค้าแล้ว'); closeTransferDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const receiveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/receive`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-transfers'] })
      qc.invalidateQueries({ queryKey: ['branch-stock'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('รับสินค้าแล้ว สต๊อกถูกอัปเดตเรียบร้อย')
      closeTransferDialog()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
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

  // ── Render ───────────────────────────────────────────────────────────────────

  const activeBranches = branches.filter((b) => b.isActive)
  const pendingBranches = branches.filter((b) => b.status === 'PENDING_APPROVAL')

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Building2 className="h-6 w-6 text-blue-600" />
            จัดการสาขา
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {activeBranches.length} สาขาที่ใช้งาน
            {pendingBranches.length > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                <Clock className="h-3 w-3" />
                {pendingBranches.length} รอการอนุมัติ
              </span>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'transfers' && (
            <button
              onClick={() => setShowTransfer(true)}
              className="flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white hover:bg-purple-700 transition-colors"
            >
              <ArrowRightLeft className="h-4 w-4" />
              <span className="hidden sm:inline">โอนสต็อก</span>
            </button>
          )}
          {tab === 'branches' && (
            <button
              onClick={() => { setEditBranch(undefined); setShowForm(true) }}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">เพิ่มสาขา</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button className="ml-auto" onClick={() => setError('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {([
          { id: 'branches', label: 'สาขา', icon: Building2 },
          { id: 'stock',     label: 'สต็อกสาขา', icon: Package },
          { id: 'transfers', label: 'โอนสต็อก', icon: ArrowRightLeft },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 flex-1 justify-center rounded-md px-3 py-2 text-sm font-medium transition-all',
              tab === t.id ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700',
            )}
          >
            <t.icon className="h-4 w-4" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* ── Branches Tab ── */}
      {tab === 'branches' && (
        <>
          {isLoading ? (
            <div className="text-center py-12 text-slate-400">กำลังโหลด...</div>
          ) : branches.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Building2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              ยังไม่มีสาขา — กดปุ่มเพิ่มสาขาเพื่อเริ่มต้น
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {branches.map((branch) => (
                <div
                  key={branch.id}
                  className={cn(
                    'rounded-xl border bg-white p-4 space-y-2 transition-all',
                    branch.isActive ? 'border-slate-200' : 'border-slate-100 opacity-60',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {branch.isDefault && (
                        <Star className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-900 truncate">{branch.name}</span>
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
                            onClick={() => {
                              const reason = prompt('เหตุผลที่ปฏิเสธ:')
                              if (reason) rejectMut.mutate({ id: branch.id, reason })
                            }}
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
                          onClick={() => {
                            const reason = prompt('เหตุผลที่ระงับ:')
                            if (reason) suspendMut.mutate({ id: branch.id, reason })
                          }}
                          className="p-1.5 rounded-lg hover:bg-orange-50 transition-colors"
                          title="ระงับสาขา"
                        >
                          <AlertCircle className="h-3.5 w-3.5 text-orange-400" />
                        </button>
                      )}
                      {!branch.isDefault && branch.isActive && (
                        <button
                          onClick={() => {
                            if (confirm(`ปิดใช้งานสาขา "${branch.name}"?`)) {
                              deactivateMut.mutate(branch.id)
                            }
                          }}
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
                  <div className="flex gap-3 pt-1 text-xs text-slate-500 border-t border-slate-100">
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
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
            <div className="text-center py-12 text-slate-400">ยังไม่มีข้อมูลสต็อกสำหรับสาขานี้</div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 text-xs text-blue-700 font-medium flex items-center gap-1">
                <Package className="h-3.5 w-3.5" />
                สต็อกเฉพาะสาขา — {branches.find(b => b.id === selectedBranchForStock)?.name}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">สินค้า</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600 hidden md:table-cell">รหัสสต็อก</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">คงเหลือ</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">ขั้นต่ำ</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {branchStock.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{s.product?.name}</div>
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

      {/* ── Transfers Tab ── */}
      {tab === 'transfers' && (
        <div className="space-y-4">
          {/* Filter tabs */}
          <div className="flex gap-1.5 flex-wrap">
            {[
              { val: 'ALL',        label: 'ทั้งหมด' },
              { val: 'PENDING',    label: 'รออนุมัติ' },
              { val: 'APPROVED',   label: 'อนุมัติแล้ว' },
              { val: 'IN_TRANSIT', label: 'กำลังส่ง' },
              { val: 'RECEIVED',   label: 'รับแล้ว' },
              { val: 'REJECTED',   label: 'ปฏิเสธ' },
              { val: 'CANCELLED',  label: 'ยกเลิก' },
            ].map((f) => (
              <button
                key={f.val}
                onClick={() => setTransferFilter(f.val)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                  transferFilter === f.val
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'border-slate-300 text-slate-600 hover:border-blue-400',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>

          {transfers.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <ArrowRightLeft className="h-10 w-10 mx-auto mb-2 opacity-40" />
              ยังไม่มีรายการโอนสต็อก
            </div>
          ) : (
            <div className="space-y-2">
              {transfers.map((t) => (
                <div key={t.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-slate-500">{t.transferNumber}</span>
                        <TransferStatusBadge status={t.status} />
                      </div>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-800 flex-wrap">
                        <span className="truncate max-w-[120px]">{t.fromBranch?.name}</span>
                        <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[120px]">{t.toBranch?.name}</span>
                      </div>
                      <p className="text-sm text-slate-600">{t.product?.name} ×{t.quantity}</p>
                      {t.note && <p className="text-xs text-slate-400">{t.note}</p>}
                      {t.rejectReason && (
                        <p className="text-xs text-red-500">เหตุผล: {t.rejectReason}</p>
                      )}
                      <p className="text-xs text-slate-400">
                        {new Date(t.createdAt).toLocaleString('th-TH')}
                        {t.requestedByName ? ` โดย ${t.requestedByName}` : ''}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5 shrink-0 items-end">
                      {/* PENDING: approve / reject / cancel */}
                      {t.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => setTransferAction({ kind: 'approve', transfer: t })}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => setTransferAction({ kind: 'reject', transfer: t })}
                            className="flex items-center gap-1 rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            ปฏิเสธ
                          </button>
                          <button
                            onClick={() => setTransferAction({ kind: 'cancel', transfer: t })}
                            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            ยกเลิก
                          </button>
                        </>
                      )}

                      {/* APPROVED: dispatch / cancel */}
                      {t.status === 'APPROVED' && (
                        <>
                          <button
                            onClick={() => setTransferAction({ kind: 'dispatch', transfer: t })}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            ส่งของ
                          </button>
                          <button
                            onClick={() => setTransferAction({ kind: 'cancel', transfer: t })}
                            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            <X className="h-3.5 w-3.5" />
                            ยกเลิก
                          </button>
                        </>
                      )}

                      {/* IN_TRANSIT: receive */}
                      {t.status === 'IN_TRANSIT' && (
                        <button
                          onClick={() => setTransferAction({ kind: 'receive', transfer: t })}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <PackageCheck className="h-3.5 w-3.5" />
                          รับของ
                        </button>
                      )}

                      {/* PENDING (legacy path): keep old complete button */}
                      {t.status === 'PENDING' && false /* hidden: use new flow */ && (
                        <button
                          onClick={() => { if (confirm('ยืนยันการรับสต็อก?')) completeMut.mutate(t.id) }}
                          className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <Check className="h-3.5 w-3.5" />
                          รับ (legacy)
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
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

      {showTransfer && (
        <TransferModal
          branches={activeBranches}
          onClose={() => setShowTransfer(false)}
          onSave={(data) => transferMut.mutate(data)}
        />
      )}

      {/* Transfer action confirmation dialog */}
      {transferAction && (() => {
        const cfg = getTransferDialogConfig(transferAction.kind)
        const isLoading = approveTransferMut.isPending || rejectTransferMut.isPending ||
          dispatchMut.isPending || receiveMut.isPending || cancelMut.isPending
        return (
          <ConfirmActionDialog
            open={!!transferAction}
            onClose={closeTransferDialog}
            loading={isLoading}
            onConfirm={(reason) => {
              const id = transferAction.transfer.id
              switch (transferAction.kind) {
                case 'approve':  approveTransferMut.mutate(id); break
                case 'reject':   rejectTransferMut.mutate({ id, rejectReason: reason || undefined }); break
                case 'dispatch': dispatchMut.mutate(id); break
                case 'receive':  receiveMut.mutate(id); break
                case 'cancel':   if (reason) cancelMut.mutate({ id, reason }); break
              }
            }}
            {...cfg}
          />
        )
      })()}
    </div>
  )
}
