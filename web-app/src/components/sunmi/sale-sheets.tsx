'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Banknote, Smartphone, CreditCard,
  X, AlertTriangle, RotateCcw,
} from 'lucide-react'
import { useEffect } from 'react'
import { pushBackHandler } from '@/lib/back-stack'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { Sale, PaymentMethod } from '@/types'

export const PM_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร',
}

export const PM_ICON: Record<PaymentMethod, React.ElementType> = {
  CASH: Banknote, TRANSFER: Smartphone, CARD: CreditCard,
}

// ── Void confirm sheet ────────────────────────────────────────────────────────

export function VoidConfirmSheet({
  sale,
  onClose,
  onSuccess,
}: {
  sale: Sale
  onClose: () => void
  onSuccess: () => void
}) {
  const [reason, setReason] = useState('')
  useEffect(() => pushBackHandler(onClose), [onClose])

  const mutation = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/void`, { reason }),
    onSuccess: () => {
      toast.success(`ยกเลิกบิล ${sale.receiptNumber} สำเร็จ`)
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const canSubmit = reason.trim().length >= 3 && !mutation.isPending

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl p-5 space-y-4 pb-8">
        <div className="flex justify-center pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <div>
            <p className="font-bold text-red-800 text-sm">ยืนยันการยกเลิกบิล</p>
            <p className="text-xs text-red-600 mt-0.5">
              {sale.receiptNumber} · {formatThaiMoney(Number(sale.total))}
            </p>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">
            เหตุผล <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น ลูกค้าเปลี่ยนใจ / กดผิดสินค้า"
            className="w-full h-12 px-3 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-red-400"
            autoFocus
          />
          {reason.length > 0 && reason.trim().length < 3 && (
            <p className="text-xs text-red-500">กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร</p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700">
          สต็อกสินค้าจะถูกคืนอัตโนมัติ และบิลจะถูกยกเลิกถาวร
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium active:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 h-12 rounded-2xl bg-red-600 text-white font-bold disabled:opacity-50 active:bg-red-700 flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
              : 'ยืนยันยกเลิก'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Refund sheet ─────────────────────────────────────────────────────────────

type RefundItemState = { saleItemId: string; qty: number; refundPrice: number; maxQty: number; name: string }

export function RefundSheet({
  sale,
  onClose,
  onSuccess,
}: {
  sale: Sale
  onClose: () => void
  onSuccess: () => void
}) {
  const refundableItems = sale.items.filter((i) => i.quantity - (i.refundedQty ?? 0) > 0)
  const [items, setItems] = useState<RefundItemState[]>(
    refundableItems.map((i) => ({
      saleItemId: i.id,
      qty: 0,
      refundPrice: Number(i.price),
      maxQty: i.quantity - (i.refundedQty ?? 0),
      name: i.product.name,
    })),
  )
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  useEffect(() => pushBackHandler(onClose), [onClose])

  const selected = items.filter((i) => i.qty > 0)
  const totalRefund = selected.reduce((sum, i) => sum + i.qty * i.refundPrice, 0)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/sales/${sale.id}/refund`, {
        reason,
        paymentMethod: method,
        items: selected.map((i) => ({ saleItemId: i.saleItemId, quantity: i.qty, refundPrice: i.refundPrice })),
      }),
    onSuccess: () => {
      toast.success(`คืนเงินสำเร็จ ${formatThaiMoney(totalRefund)}`)
      onSuccess()
      onClose()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const canSubmit = selected.length > 0 && reason.trim().length >= 3 && !mutation.isPending

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl p-5 space-y-4 pb-8 max-h-[85vh] overflow-y-auto">
        <div className="flex justify-center pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-300" />
        </div>

        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded-2xl px-4 py-3">
          <RotateCcw className="h-5 w-5 text-orange-500 shrink-0" />
          <div>
            <p className="font-bold text-orange-800 text-sm">คืนเงิน (Partial Refund)</p>
            <p className="text-xs text-orange-600 mt-0.5">{sale.receiptNumber}</p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">เลือกสินค้าที่ต้องการคืน</p>
          {items.map((item, idx) => (
            <div key={item.saleItemId} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 truncate">{item.name}</p>
                <p className="text-xs text-slate-400">
                  คืนได้ {item.maxQty} ชิ้น · {formatThaiMoney(item.refundPrice)}/ชิ้น
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, qty: Math.max(0, it.qty - 1) } : it))}
                  className="w-8 h-8 rounded-full border-2 border-slate-200 text-slate-600 font-bold flex items-center justify-center active:bg-slate-100"
                >-</button>
                <span className="w-6 text-center text-sm font-bold tabular-nums">{item.qty}</span>
                <button
                  onClick={() => setItems((prev) => prev.map((it, i) => i === idx ? { ...it, qty: Math.min(it.maxQty, it.qty + 1) } : it))}
                  className="w-8 h-8 rounded-full border-2 border-slate-200 text-slate-600 font-bold flex items-center justify-center active:bg-slate-100"
                >+</button>
              </div>
            </div>
          ))}
        </div>

        {totalRefund > 0 && (
          <div className="flex justify-between items-center bg-orange-50 rounded-xl px-4 py-3">
            <span className="font-semibold text-orange-800">ยอดคืนเงิน</span>
            <span className="text-xl font-bold text-orange-700 tabular-nums">{formatThaiMoney(totalRefund)}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-slate-700">ช่องทางคืนเงิน</p>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'TRANSFER', 'CARD'] as const).map((m) => {
              const labels = { CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร' }
              return (
                <button
                  key={m}
                  onClick={() => setMethod(m)}
                  className={`py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                    method === m ? 'border-orange-500 bg-orange-500 text-white' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  {labels[m]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-700">
            เหตุผล <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เช่น สินค้าชำรุด / ผิดรุ่น"
            className="w-full h-12 px-3 border-2 border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:border-orange-400"
            autoFocus
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium active:bg-slate-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="flex-1 h-12 rounded-2xl bg-orange-600 text-white font-bold disabled:opacity-50 active:bg-orange-700 flex items-center justify-center gap-2"
          >
            {mutation.isPending
              ? <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
              : 'ยืนยันคืนเงิน'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Sale detail sheet ─────────────────────────────────────────────────────────

export function SaleDetailSheet({
  sale,
  canVoid,
  onClose,
  onVoidRequest,
  onRefundRequest,
}: {
  sale: Sale
  canVoid: boolean
  onClose: () => void
  onVoidRequest: () => void
  onRefundRequest: () => void
}) {
  useEffect(() => pushBackHandler(onClose), [onClose])
  const PMIcon = PM_ICON[sale.paymentMethod as PaymentMethod] ?? Banknote
  const isVoided = sale.status === 'VOIDED'
  const isRefunded = sale.status === 'REFUNDED'
  const isPartialRefund = sale.status === 'PARTIAL_REFUND'
  const canRefund = canVoid && !isVoided && !isRefunded &&
    sale.items.some((i) => i.quantity - (i.refundedQty ?? 0) > 0)

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-center pt-3 pb-2 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300" />
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-mono font-bold text-blue-700 text-base">{sale.receiptNumber}</p>
              <p className="text-sm text-slate-400 mt-0.5">
                {format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: th })}
              </p>
            </div>
            <button
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center text-slate-400 active:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {isVoided && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 space-y-1">
              <p className="text-sm font-bold text-red-700">ยกเลิกบิลแล้ว</p>
              {sale.voidReason && (
                <p className="text-xs text-red-600">เหตุผล: {sale.voidReason}</p>
              )}
              {sale.voidedBy && sale.voidedAt && (
                <p className="text-xs text-red-500">
                  โดย {sale.voidedBy.name} · {format(new Date(sale.voidedAt), 'dd/MM/yyyy HH:mm', { locale: th })}
                </p>
              )}
            </div>
          )}

          {(isPartialRefund || isRefunded) && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl px-3 py-2.5 space-y-1">
              <p className="text-sm font-bold text-orange-700">
                {isRefunded ? 'คืนเงินครบแล้ว' : 'คืนเงินบางส่วนแล้ว'}
              </p>
              {sale.refunds && sale.refunds.length > 0 && (
                <p className="text-xs text-orange-600">
                  รวมคืน: {formatThaiMoney(sale.refunds.reduce((s, r) => s + Number(r.totalRefund), 0))}
                </p>
              )}
            </div>
          )}

          <div className="bg-slate-50 rounded-2xl p-3 space-y-2">
            {sale.items.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900 leading-tight truncate">
                    {item.product.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × {formatThaiMoney(Number(item.price))}
                  </p>
                </div>
                <span className="text-sm font-bold text-slate-700 tabular-nums shrink-0">
                  {formatThaiMoney(Number(item.total))}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>ยอดรวม</span>
              <span className="tabular-nums">{formatThaiMoney(Number(sale.subtotal))}</span>
            </div>
            {Number(sale.discount) > 0 && (
              <div className="flex justify-between text-red-500">
                <span>ส่วนลด</span>
                <span className="tabular-nums">-{formatThaiMoney(Number(sale.discount))}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-xl pt-2 border-t border-slate-200">
              <span>รวมทั้งสิ้น</span>
              <span className="tabular-nums text-slate-900">
                {formatThaiMoney(Number(sale.total))}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-slate-50 rounded-xl p-3">
            <PMIcon className="h-5 w-5 text-slate-500 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-700">
                {PM_LABEL[sale.paymentMethod as PaymentMethod]}
              </p>
              <p className="text-xs text-slate-400">
                รับ {formatThaiMoney(Number(sale.amountPaid))} · ทอน {formatThaiMoney(Number(sale.change))}
              </p>
            </div>
          </div>

          {sale.customer && (
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <span className="text-slate-400">ลูกค้า:</span>
              <span className="font-semibold">{sale.customer.name}</span>
              {sale.customer.phone && (
                <span className="text-slate-400">{sale.customer.phone}</span>
              )}
            </div>
          )}
          <p className="text-xs text-slate-400">แคชเชียร์: {sale.user?.name ?? '-'}</p>

          <div className="space-y-2">
            {canRefund && (
              <button
                onClick={onRefundRequest}
                className="w-full h-12 rounded-2xl border-2 border-orange-300 text-orange-600 font-bold text-sm active:bg-orange-50 flex items-center justify-center gap-2"
              >
                <RotateCcw className="h-4 w-4" />
                คืนเงินสินค้า
              </button>
            )}
            {!isVoided && canVoid && !isRefunded && !isPartialRefund && (
              <button
                onClick={onVoidRequest}
                className="w-full h-12 rounded-2xl border-2 border-red-300 text-red-600 font-bold text-sm active:bg-red-50 flex items-center justify-center gap-2"
              >
                <AlertTriangle className="h-4 w-4" />
                ยกเลิกบิลนี้
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
