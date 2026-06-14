'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ArrowRightLeft, Check, X, ChevronRight, Package, Clock, Truck,
  CheckCircle2, XCircle, Loader2, Bell, PackageCheck,
} from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import type { StockTransfer } from '@/types'
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog'

// ── Types ─────────────────────────────────────────────────────────────────────

type ActionKind = 'approve' | 'reject' | 'dispatch' | 'receive' | 'cancel'
type PendingAction = { kind: ActionKind; transfer: StockTransfer } | null

// ── Dialog config (same as desktop, reused) ───────────────────────────────────

function getDialogConfig(kind: ActionKind) {
  switch (kind) {
    case 'approve':  return {
      title: 'ยืนยันอนุมัติคำขอโอน',
      description: 'ต้องการอนุมัติให้สาขาต้นทางจัดส่งสินค้านี้หรือไม่?',
      icon: CheckCircle2, variant: 'info' as const, confirmLabel: 'อนุมัติ',
    }
    case 'reject':   return {
      title: 'ปฏิเสธคำขอโอน',
      description: 'กรุณาระบุเหตุผลการปฏิเสธ',
      icon: XCircle, variant: 'danger' as const, confirmLabel: 'ปฏิเสธ',
      requireReason: true, reasonLabel: 'เหตุผลที่ปฏิเสธ', reasonPlaceholder: 'ระบุเหตุผล (ไม่บังคับ)...',
    }
    case 'dispatch': return {
      title: 'ยืนยันจัดส่งสินค้า',
      description: 'ยืนยันว่าได้ส่งสินค้าออกจากสาขาต้นทางแล้ว',
      icon: Truck, variant: 'info' as const, confirmLabel: 'จัดส่งแล้ว',
    }
    case 'receive':  return {
      title: 'ยืนยันรับสินค้า',
      description: 'เมื่อกดยืนยัน ระบบจะเพิ่มสต๊อกเข้าสาขาปลายทางและลดสต๊อกจากสาขาต้นทาง',
      icon: PackageCheck, variant: 'success' as const, confirmLabel: 'รับสินค้าแล้ว',
    }
    case 'cancel':   return {
      title: 'ยกเลิกคำขอโอน',
      description: 'ต้องการยกเลิกคำขอโอนนี้หรือไม่?',
      icon: XCircle, variant: 'warning' as const, confirmLabel: 'ยกเลิกคำขอ',
      requireReason: true, reasonLabel: 'เหตุผลที่ยกเลิก', reasonPlaceholder: 'ระบุเหตุผล...',
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  PENDING:    { label: 'รออนุมัติ',    cls: 'bg-amber-900/30 text-amber-300',   icon: Clock },
  APPROVED:   { label: 'อนุมัติแล้ว',  cls: 'bg-blue-900/30 text-blue-300',     icon: CheckCircle2 },
  REJECTED:   { label: 'ปฏิเสธ',       cls: 'bg-red-900/30 text-red-400',       icon: XCircle },
  IN_TRANSIT: { label: 'กำลังส่ง',     cls: 'bg-indigo-900/30 text-indigo-300', icon: Truck },
  RECEIVED:   { label: 'รับแล้ว',       cls: 'bg-green-900/30 text-green-400',   icon: CheckCircle2 },
  COMPLETED:  { label: 'เสร็จสิ้น',    cls: 'bg-green-900/30 text-green-400',   icon: CheckCircle2 },
  CANCELLED:  { label: 'ยกเลิก',        cls: 'bg-slate-700 text-slate-400',      icon: XCircle },
}

const BTN = {
  green:   'flex-1 h-14 rounded-2xl bg-green-600 text-white font-bold text-base active:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2',
  blue:    'flex-1 h-14 rounded-2xl bg-blue-600 text-white font-bold text-base active:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2',
  indigo:  'flex-1 h-14 rounded-2xl bg-indigo-600 text-white font-bold text-base active:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2',
  danger:  'flex-1 h-14 rounded-2xl bg-red-600 text-white font-bold text-base active:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2',
  outline: 'flex-1 h-14 rounded-2xl border-2 border-slate-600 text-slate-300 font-medium text-base active:bg-slate-700 disabled:opacity-50 flex items-center justify-center gap-2',
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CFG[status] ?? { label: status, cls: 'bg-slate-700 text-slate-400', icon: Clock }
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SunmiTransfersPage() {
  const qc           = useQueryClient()
  const user         = useAuthStore((s) => s.user)
  const branchId     = user?.branchId
  const isPrivileged = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'

  const [tab, setTab]                 = useState<'incoming' | 'outgoing'>('incoming')
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)

  const { data: transfers = [], isLoading } = useQuery<StockTransfer[]>({
    queryKey: ['sunmi-transfers', branchId],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      return (await api.get(`/branches/transfers/list?${params}`)).data
    },
    staleTime: 30_000,
    enabled: !!branchId || isPrivileged,
    refetchInterval: 60_000,
  })

  const incoming = transfers.filter((t) => t.toBranchId === branchId)
  const outgoing = transfers.filter((t) => t.fromBranchId === branchId)

  // ── Mutations ─────────────────────────────────────────────────────────────

  const invalidate  = () => qc.invalidateQueries({ queryKey: ['sunmi-transfers'] })
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
      qc.invalidateQueries({ queryKey: ['products'] })
      toast.success('รับสินค้าแล้ว สต๊อกถูกอัปเดตเรียบร้อย')
      closeDialog()
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  const anyPending = approveMut.isPending || rejectMut.isPending ||
    dispatchMut.isPending || receiveMut.isPending

  const pendingOutgoing = outgoing.filter((t) => t.status === 'PENDING')

  function openAction(kind: ActionKind, t: StockTransfer) {
    setPendingAction({ kind, transfer: t })
  }

  function handleConfirm(reason?: string) {
    if (!pendingAction) return
    const id = pendingAction.transfer.id
    switch (pendingAction.kind) {
      case 'approve':  approveMut.mutate(id); break
      case 'reject':   rejectMut.mutate({ id, rejectReason: reason || undefined }); break
      case 'dispatch': dispatchMut.mutate(id); break
      case 'receive':  receiveMut.mutate(id); break
    }
  }

  const dialogCfg = pendingAction ? getDialogConfig(pendingAction.kind) : null
  const displayed = tab === 'incoming' ? incoming : outgoing

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SunmiShell title="โอนสต็อกระหว่างสาขา" showBack={false}>
      {/* Source branch alert: pending outgoing requests waiting for approval */}
      {pendingOutgoing.length > 0 && (
        <div className="mx-4 mt-3 rounded-2xl bg-amber-500/20 border border-amber-500/40 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-amber-400 shrink-0" />
            <p className="text-amber-300 font-bold text-base">
              มีสาขาขอโอนสินค้า ({pendingOutgoing.length} รายการ)
            </p>
          </div>
          {pendingOutgoing.slice(0, 3).map((t) => (
            <div key={t.id} className="bg-slate-900/60 rounded-xl p-3 space-y-2">
              <div className="min-w-0">
                <p className="text-white font-semibold text-sm truncate">
                  {t.product?.name} <span className="text-amber-300">×{t.quantity}</span>
                </p>
                <p className="text-slate-400 text-xs mt-0.5">
                  {t.toBranch?.name} ขอจากสาขาของคุณ
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="flex-1 h-12 rounded-xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  disabled={anyPending}
                  onClick={() => openAction('approve', t)}
                >
                  {approveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  อนุมัติ
                </button>
                <button
                  className="flex-1 h-12 rounded-xl bg-red-600 text-white font-semibold text-sm active:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-1.5"
                  disabled={anyPending}
                  onClick={() => openAction('reject', t)}
                >
                  <X className="h-4 w-4" />
                  ปฏิเสธ
                </button>
              </div>
            </div>
          ))}
          {pendingOutgoing.length > 3 && (
            <p className="text-amber-400 text-xs text-center">
              และอีก {pendingOutgoing.length - 3} รายการ — ดูใน &ldquo;ขาออก&rdquo;
            </p>
          )}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex bg-slate-800 rounded-2xl p-1 mx-4 mt-3 mb-1">
        {(['incoming', 'outgoing'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors',
              tab === t ? 'bg-blue-600 text-white' : 'text-slate-400',
            )}
          >
            {t === 'incoming'
              ? `ขาเข้า${incoming.length ? ` (${incoming.length})` : ''}`
              : `ขาออก${outgoing.length ? ` (${outgoing.length})` : ''}`}
          </button>
        ))}
      </div>

      <div className="px-4 pb-4 space-y-3 mt-3">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-slate-500 gap-3">
            <ArrowRightLeft className="h-12 w-12 opacity-30" />
            <p className="text-base">
              {tab === 'incoming' ? 'ไม่มีรายการโอนขาเข้า' : 'ไม่มีรายการโอนขาออก'}
            </p>
          </div>
        ) : (
          displayed.map((t) => (
            <div key={t.id} className="bg-slate-800 rounded-2xl p-4 space-y-3">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-base leading-tight truncate">
                    {t.product?.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-slate-300 text-sm font-semibold">×{t.quantity}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
                <div className="flex items-center gap-1 text-slate-400 text-xs shrink-0">
                  <Package className="h-3.5 w-3.5" />
                  <span className="font-mono">{t.product?.sku}</span>
                </div>
              </div>

              {/* Route */}
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <span className="truncate max-w-[100px]">{t.fromBranch?.name}</span>
                <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                <span className="truncate max-w-[100px]">{t.toBranch?.name}</span>
              </div>

              {t.note && (
                <p className="text-xs text-slate-400 border-t border-slate-700 pt-2">{t.note}</p>
              )}
              {t.rejectReason && (
                <p className="text-xs text-red-400 border-t border-slate-700 pt-2">เหตุผล: {t.rejectReason}</p>
              )}
              <p className="text-xs text-slate-500 font-mono">{t.transferNumber}</p>

              {/* Action buttons */}

              {/* Outgoing: PENDING → approve / reject */}
              {tab === 'outgoing' && t.status === 'PENDING' && (
                <div className="flex gap-2 pt-1">
                  <button className={BTN.blue} disabled={anyPending} onClick={() => openAction('approve', t)}>
                    {approveMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                    อนุมัติ
                  </button>
                  <button className={BTN.danger} disabled={anyPending} onClick={() => openAction('reject', t)}>
                    <X className="h-5 w-5" />
                    ปฏิเสธ
                  </button>
                </div>
              )}

              {/* Outgoing: APPROVED → dispatch */}
              {tab === 'outgoing' && t.status === 'APPROVED' && (
                <button className={BTN.indigo} disabled={anyPending} onClick={() => openAction('dispatch', t)}>
                  {dispatchMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
                  ส่งของออกจากสาขา
                </button>
              )}

              {/* Outgoing: IN_TRANSIT → waiting */}
              {tab === 'outgoing' && t.status === 'IN_TRANSIT' && (
                <div className="flex items-center gap-2 text-indigo-300 text-sm bg-indigo-900/20 rounded-xl px-3 py-2.5">
                  <Truck className="h-4 w-4 shrink-0" />
                  <span>กำลังส่ง รอสาขาปลายทางยืนยันรับ</span>
                </div>
              )}

              {/* Incoming: PENDING → waiting */}
              {tab === 'incoming' && t.status === 'PENDING' && (
                <div className="flex items-center gap-2 text-amber-300 text-sm bg-amber-900/20 rounded-xl px-3 py-2.5">
                  <Clock className="h-4 w-4 shrink-0" />
                  <span>รอสาขาต้นทางอนุมัติ</span>
                </div>
              )}

              {/* Incoming: APPROVED → waiting dispatch */}
              {tab === 'incoming' && t.status === 'APPROVED' && (
                <div className="flex items-center gap-2 text-blue-300 text-sm bg-blue-900/20 rounded-xl px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>อนุมัติแล้ว รอสาขาต้นทางส่งของ</span>
                </div>
              )}

              {/* Incoming: IN_TRANSIT → receive */}
              {tab === 'incoming' && t.status === 'IN_TRANSIT' && (
                <button className={BTN.green} disabled={anyPending} onClick={() => openAction('receive', t)}>
                  {receiveMut.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <PackageCheck className="h-5 w-5" />}
                  ยืนยันรับของ
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Confirmation dialog — buttonSize="lg" for touch targets */}
      {dialogCfg && (
        <ConfirmActionDialog
          open={!!pendingAction}
          onClose={closeDialog}
          onConfirm={handleConfirm}
          loading={anyPending}
          buttonSize="lg"
          {...dialogCfg}
        />
      )}
    </SunmiShell>
  )
}
