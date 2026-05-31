'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRightLeft, ChevronRight, AlertCircle, Bell,
  CheckCircle2, XCircle, Truck, PackageCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { toast } from 'sonner'
import api from '@/lib/api'
import type { StockTransfer } from '@/types'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionKind = 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel'
type PendingAction = { kind: ActionKind; transfer: StockTransfer } | null

// ── Dialog config ─────────────────────────────────────────────────────────────

function getDialogConfig(kind: ActionKind) {
  switch (kind) {
    case 'approve':  return {
      title:       'ยืนยันอนุมัติคำขอโอน',
      description: 'ต้องการอนุมัติให้สาขาต้นทางจัดส่งสินค้านี้หรือไม่?',
      icon:        CheckCircle2,
      variant:     'info' as const,
      confirmLabel:'อนุมัติ',
    }
    case 'reject':   return {
      title:          'ปฏิเสธคำขอโอน',
      description:    'กรุณาระบุเหตุผลการปฏิเสธ',
      icon:           XCircle,
      variant:        'danger' as const,
      confirmLabel:   'ปฏิเสธ',
      requireReason:  true,
      reasonLabel:    'เหตุผลที่ปฏิเสธ',
      reasonPlaceholder: 'ระบุเหตุผล (ไม่บังคับ)...',
    }
    case 'dispatch': return {
      title:       'ยืนยันจัดส่งสินค้า',
      description: 'ยืนยันว่าได้ส่งสินค้าออกจากสาขาต้นทางแล้ว',
      icon:        Truck,
      variant:     'info' as const,
      confirmLabel:'จัดส่งแล้ว',
    }
    case 'receive':  return {
      title:       'ยืนยันรับสินค้า',
      description: 'เมื่อกดยืนยัน ระบบจะเพิ่มสต๊อกเข้าสาขาปลายทางและลดสต๊อกจากสาขาต้นทาง',
      icon:        PackageCheck,
      variant:     'success' as const,
      confirmLabel:'รับสินค้าแล้ว',
    }
    case 'cancel':   return {
      title:          'ยกเลิกคำขอโอน',
      description:    'ต้องการยกเลิกคำขอโอนนี้หรือไม่?',
      icon:           XCircle,
      variant:        'warning' as const,
      confirmLabel:   'ยกเลิกคำขอ',
      requireReason:  true,
      reasonLabel:    'เหตุผลที่ยกเลิก',
      reasonPlaceholder: 'ระบุเหตุผล...',
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  PENDING:    { label: 'รออนุมัติ',   cls: 'bg-amber-100 text-amber-700' },
  APPROVED:   { label: 'อนุมัติแล้ว', cls: 'bg-blue-100 text-blue-700' },
  REJECTED:   { label: 'ปฏิเสธ',      cls: 'bg-red-100 text-red-600' },
  IN_TRANSIT: { label: 'กำลังส่ง',    cls: 'bg-indigo-100 text-indigo-700' },
  RECEIVED:   { label: 'รับแล้ว',      cls: 'bg-green-100 text-green-700' },
  COMPLETED:  { label: 'เสร็จสิ้น',   cls: 'bg-green-100 text-green-700' },
  CANCELLED:  { label: 'ยกเลิก',       cls: 'bg-slate-100 text-slate-500' },
}

function TransferStatusBadge({ status }: { status: string }) {
  const { label, cls } = STATUS_CFG[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold', cls)}>
      {label}
    </span>
  )
}

const FILTER_TABS = [
  { val: 'ALL',        label: 'ทั้งหมด' },
  { val: 'PENDING',    label: 'รออนุมัติ' },
  { val: 'APPROVED',   label: 'อนุมัติแล้ว' },
  { val: 'IN_TRANSIT', label: 'กำลังส่ง' },
  { val: 'RECEIVED',   label: 'รับแล้ว' },
  { val: 'REJECTED',   label: 'ปฏิเสธ' },
  { val: 'CANCELLED',  label: 'ยกเลิก' },
] as const

// ── Inner page (uses useSearchParams — must be inside Suspense) ───────────────

function TransfersContent() {
  const router        = useRouter()
  const searchParams  = useSearchParams()
  const highlight     = searchParams.get('highlight')
  const qc            = useQueryClient()
  const user          = useAuthStore((s) => s.user)
  const hasPerm       = useAuthStore((s) => s.hasPermission)

  const [filter, setFilter]           = useState<string>('ALL')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const isOwner         = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const currentBranchId = user?.branchId ?? null
  const highlightRef    = useRef<HTMLDivElement | null>(null)

  if (!hasPerm('stock.transfer')) {
    router.replace('/403')
    return null
  }

  const { data: transfers = [], isLoading } = useQuery<StockTransfer[]>({
    queryKey: ['stock-transfers', filter, currentBranchId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (filter !== 'ALL') params.set('status', filter)
      if (!isOwner && currentBranchId) params.set('branchId', currentBranchId)
      return (await api.get(`/branches/transfers/list?${params}`)).data
    },
    staleTime: 20_000,
  })

  const { data: pendingSource = [] } = useQuery<StockTransfer[]>({
    queryKey: ['stock-transfers-pending-source', currentBranchId],
    queryFn: async () => {
      if (!currentBranchId) return []
      const params = new URLSearchParams({ status: 'PENDING', branchId: currentBranchId })
      return (await api.get(`/branches/transfers/list?${params}`)).data
    },
    enabled: !isOwner && !!currentBranchId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const pendingSourceCount = pendingSource.filter(t => t.fromBranchId === currentBranchId).length

  useEffect(() => {
    if (highlight && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlight, transfers])

  // ── Mutations ────────────────────────────────────────────────────────────────

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['stock-transfers'] })
    qc.invalidateQueries({ queryKey: ['stock-transfers-pending-source'] })
  }
  const closeDialog = () => setPendingAction(null)

  const approveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/approve`),
    onSuccess: () => { invalidate(); toast.success('อนุมัติคำขอแล้ว'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const rejectMut = useMutation({
    mutationFn: ({ id, rejectReason }: { id: string; rejectReason?: string }) =>
      api.patch(`/branches/transfers/${id}/reject`, { rejectReason }),
    onSuccess: () => { invalidate(); toast.success('ปฏิเสธคำขอแล้ว'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const dispatchMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/dispatch`),
    onSuccess: () => { invalidate(); toast.success('จัดส่งสินค้าแล้ว'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const receiveMut = useMutation({
    mutationFn: (id: string) => api.patch(`/branches/transfers/${id}/receive`),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['branch-stock'] })
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('รับสินค้าแล้ว สต๊อกถูกอัปเดตเรียบร้อย')
      closeDialog()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const cancelMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/branches/transfers/${id}/cancel`, { reason }),
    onSuccess: () => { invalidate(); toast.success('ยกเลิกคำขอแล้ว'); closeDialog() },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  // ── Action dispatch ───────────────────────────────────────────────────────

  const isMutating = approveMut.isPending || rejectMut.isPending ||
    dispatchMut.isPending || receiveMut.isPending || cancelMut.isPending

  function handleConfirm(reason?: string) {
    if (!pendingAction) return
    const id = pendingAction.transfer.id
    switch (pendingAction.kind) {
      case 'approve':  approveMut.mutate(id); break
      case 'reject':   rejectMut.mutate({ id, rejectReason: reason || undefined }); break
      case 'dispatch': dispatchMut.mutate(id); break
      case 'receive':  receiveMut.mutate(id); break
      case 'cancel':   if (reason) cancelMut.mutate({ id, reason }); break
    }
  }

  function openAction(kind: ActionKind, transfer: StockTransfer) {
    setPendingAction({ kind, transfer })
  }

  // ── Per-transfer role helpers ─────────────────────────────────────────────

  function isSource(t: StockTransfer) { return isOwner || currentBranchId === t.fromBranchId }
  function isDest(t: StockTransfer)   { return isOwner || currentBranchId === t.toBranchId }

  // ── Render ───────────────────────────────────────────────────────────────────

  const dialogCfg = pendingAction ? getDialogConfig(pendingAction.kind) : null

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ArrowRightLeft className="h-6 w-6 text-blue-600" />
          โอนสต๊อก
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">จัดการคำขอโอนสินค้าระหว่างสาขา</p>
      </div>

      {/* Source branch pending alert */}
      {!isOwner && pendingSourceCount > 0 && (
        <div className="flex items-center gap-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
          <Bell className="h-5 w-5 text-amber-600 shrink-0" />
          <p className="text-sm font-medium text-amber-800 flex-1">
            มี {pendingSourceCount} คำขอโอนสินค้ารออนุมัติจากสาขาของคุณ
          </p>
          <button
            onClick={() => setFilter('PENDING')}
            className="text-xs font-semibold text-amber-700 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-lg px-3 py-1.5 transition-colors"
          >
            ดูรายการ
          </button>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTER_TABS.map((f) => (
          <button
            key={f.val}
            onClick={() => setFilter(f.val)}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              filter === f.val
                ? 'bg-blue-600 border-blue-600 text-white'
                : 'border-slate-300 text-slate-600 hover:border-blue-400',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Transfer list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : transfers.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <ArrowRightLeft className="h-10 w-10 mx-auto mb-2 opacity-40" />
          <p className="text-sm">ยังไม่มีรายการโอนสต็อก</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transfers.map((t) => {
            const isHighlighted = highlight === t.id
            const src = isSource(t)
            const dst = isDest(t)

            return (
              <div
                key={t.id}
                id={`transfer-${t.id}`}
                ref={isHighlighted ? highlightRef : null}
                className={cn(
                  'rounded-xl border bg-white p-4 shadow-sm transition-all',
                  isHighlighted
                    ? 'border-blue-500 ring-2 ring-blue-200 shadow-blue-100'
                    : 'border-slate-200',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Info */}
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-slate-500">{t.transferNumber}</span>
                      <TransferStatusBadge status={t.status} />
                      {!isOwner && (
                        <span className={cn(
                          'text-[10px] font-medium px-1.5 py-0.5 rounded-full',
                          src && dst ? 'bg-purple-100 text-purple-600' :
                          src        ? 'bg-orange-100 text-orange-600' :
                          dst        ? 'bg-teal-100 text-teal-600'     : 'bg-slate-100 text-slate-500',
                        )}>
                          {src && dst ? 'ต้นทาง+ปลายทาง' : src ? 'ต้นทาง' : dst ? 'ปลายทาง' : ''}
                        </span>
                      )}
                    </div>

                    <p className="text-sm font-semibold text-slate-800">
                      {t.product?.name ?? '—'}
                      {t.product?.sku && (
                        <span className="ml-1.5 font-normal text-xs text-slate-400">({t.product.sku})</span>
                      )}
                      <span className="ml-1.5 text-blue-700 font-bold">×{t.quantity}</span>
                    </p>

                    <div className="flex items-center gap-1.5 text-sm text-slate-600 flex-wrap">
                      <span className="font-medium truncate max-w-[150px]">{t.fromBranch?.name ?? '—'}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium truncate max-w-[150px]">{t.toBranch?.name ?? '—'}</span>
                    </div>

                    {t.note && <p className="text-xs text-slate-400 italic">{t.note}</p>}
                    {t.rejectReason && (
                      <p className="flex items-center gap-1 text-xs text-red-500">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        เหตุผล: {t.rejectReason}
                      </p>
                    )}
                    {t.cancelReason && <p className="text-xs text-slate-400">ยกเลิก: {t.cancelReason}</p>}
                    <p className="text-xs text-slate-400">
                      {new Date(t.createdAt).toLocaleString('th-TH')}
                      {t.requestedByName ? ` โดย ${t.requestedByName}` : ''}
                    </p>
                  </div>

                  {/* Action buttons — branch-scoped */}
                  <div className="flex flex-col gap-1.5 shrink-0 items-end">

                    {t.status === 'PENDING' && (
                      <>
                        {src && (
                          <>
                            <button
                              onClick={() => openAction('approve', t)}
                              className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              อนุมัติ
                            </button>
                            <button
                              onClick={() => openAction('reject', t)}
                              className="flex items-center gap-1 rounded-lg border border-orange-300 px-3 py-1.5 text-xs font-medium text-orange-600 hover:bg-orange-50"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              ปฏิเสธ
                            </button>
                          </>
                        )}
                        {(dst && !src) || isOwner ? (
                          <button
                            onClick={() => openAction('cancel', t)}
                            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            ยกเลิก
                          </button>
                        ) : null}
                      </>
                    )}

                    {t.status === 'APPROVED' && (
                      <>
                        {src && (
                          <button
                            onClick={() => openAction('dispatch', t)}
                            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
                          >
                            <Truck className="h-3.5 w-3.5" />
                            ส่งของ
                          </button>
                        )}
                        {((dst && !src) || isOwner) && (
                          <button
                            onClick={() => openAction('cancel', t)}
                            className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            ยกเลิก
                          </button>
                        )}
                      </>
                    )}

                    {t.status === 'IN_TRANSIT' && (
                      <>
                        {dst && !src && (
                          <button
                            onClick={() => openAction('receive', t)}
                            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            รับสินค้าแล้ว
                          </button>
                        )}
                        {src && !dst && (
                          <span className="text-xs text-slate-400 italic">รอสาขาปลายทางรับ</span>
                        )}
                        {isOwner && (
                          <button
                            onClick={() => openAction('receive', t)}
                            className="flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                          >
                            <PackageCheck className="h-3.5 w-3.5" />
                            รับสินค้า (override)
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Confirmation dialog */}
      {dialogCfg && (
        <ConfirmActionDialog
          open={!!pendingAction}
          onClose={closeDialog}
          onConfirm={handleConfirm}
          loading={isMutating}
          {...dialogCfg}
        />
      )}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TransfersPage() {
  return (
    <Suspense>
      <TransfersContent />
    </Suspense>
  )
}
