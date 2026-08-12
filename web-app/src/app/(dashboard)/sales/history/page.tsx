'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Banknote, Smartphone, CreditCard, Receipt, RefreshCw,
  X, AlertTriangle, RotateCcw, ChevronRight, Search, Minus, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { formatThaiMoney, cn, apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { Sale, PaymentMethod } from '@/types'

const PM_LABEL: Record<PaymentMethod, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร',
}
const PM_ICON: Record<PaymentMethod, React.ElementType> = {
  CASH: Banknote, TRANSFER: Smartphone, CARD: CreditCard,
}

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── Void dialog ───────────────────────────────────────────────────────────────

function VoidDialog({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/void`, { reason }),
    onSuccess: () => {
      toast.success(`ยกเลิกบิล ${sale.receiptNumber} สำเร็จ`)
      onSuccess()
      onClose()
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            ยืนยันยกเลิกบิล
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="font-bold text-red-800 text-sm">{sale.receiptNumber}</p>
            <p className="text-xs text-red-600 mt-0.5">
              {formatThaiMoney(Number(sale.total))} ·{' '}
              {format(new Date(sale.createdAt), 'dd/MM/yyyy HH:mm', { locale: th })}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>เหตุผล <span className="text-red-500">*</span></Label>
            <Input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ลูกค้าเปลี่ยนใจ / กดผิดสินค้า"
            />
            {reason.length > 0 && reason.trim().length < 3 && (
              <p className="text-xs text-red-500">กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร</p>
            )}
          </div>

          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            สต็อกสินค้าจะถูกคืนอัตโนมัติ และบิลจะถูกยกเลิกถาวร
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>ยกเลิก</Button>
          <Button
            variant="destructive"
            disabled={reason.trim().length < 3 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'กำลังดำเนินการ...' : 'ยืนยันยกเลิกบิล'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Refund dialog ─────────────────────────────────────────────────────────────

type RefundLineState = { selected: boolean; qty: number }

function RefundDialog({ sale, onClose, onSuccess }: { sale: Sale; onClose: () => void; onSuccess: () => void }) {
  const [reason, setReason]   = useState('')
  const [note,   setNote]     = useState('')
  const [pm,     setPm]       = useState<PaymentMethod>('CASH')

  const refundableItems = useMemo(
    () => sale.items.filter((i) => i.refundedQty < i.quantity),
    [sale.items],
  )

  const [lines, setLines] = useState<Record<string, RefundLineState>>(() =>
    Object.fromEntries(refundableItems.map((i) => [i.id, { selected: false, qty: i.quantity - i.refundedQty }])),
  )

  const selectedItems = refundableItems.filter((i) => lines[i.id]?.selected)

  const totalRefund = useMemo(() =>
    selectedItems.reduce((sum, i) => {
      const unitPrice = i.quantity > 0 ? Number(i.total) / i.quantity : Number(i.price)
      return sum + unitPrice * (lines[i.id]?.qty ?? 1)
    }, 0),
    [selectedItems, lines],
  )

  function toggleItem(id: string) {
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], selected: !prev[id].selected } }))
  }

  function setQty(id: string, val: number, max: number) {
    const clamped = Math.max(1, Math.min(max, val))
    setLines((prev) => ({ ...prev, [id]: { ...prev[id], qty: clamped } }))
  }

  const canSubmit = selectedItems.length > 0 && reason.trim().length >= 3

  const mutation = useMutation({
    mutationFn: () => api.post(`/sales/${sale.id}/refund`, {
      reason: reason.trim(),
      paymentMethod: pm,
      note: note.trim() || undefined,
      items: selectedItems.map((i) => ({
        saleItemId: i.id,
        quantity:   lines[i.id].qty,
        refundPrice: i.quantity > 0 ? Number(i.total) / i.quantity : Number(i.price),
      })),
    }),
    onSuccess: () => {
      toast.success(`คืนสินค้า ${sale.receiptNumber} สำเร็จ`)
      onSuccess()
      onClose()
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-orange-600">
            <RotateCcw className="h-5 w-5" />
            คืนสินค้าบางส่วน
          </DialogTitle>
          <p className="text-sm text-slate-400 font-mono">{sale.receiptNumber}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Item selection */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">เลือกรายการที่ต้องการคืน</p>
            {refundableItems.map((item) => {
              const remaining = item.quantity - item.refundedQty
              const line      = lines[item.id]
              const unitPrice = item.quantity > 0 ? Number(item.total) / item.quantity : Number(item.price)
              return (
                <div
                  key={item.id}
                  className={cn(
                    'rounded-xl border p-3 cursor-pointer transition-colors',
                    line.selected
                      ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/10'
                      : 'border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40',
                  )}
                  onClick={() => toggleItem(item.id)}
                >
                  <div className="flex items-start gap-3">
                    {/* Checkbox */}
                    <div className={cn(
                      'mt-0.5 h-4 w-4 rounded border-2 flex-shrink-0 flex items-center justify-center',
                      line.selected ? 'bg-orange-500 border-orange-500' : 'border-slate-300',
                    )}>
                      {line.selected && <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold leading-tight">{item.product?.name ?? 'สินค้า'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        ราคา {formatThaiMoney(unitPrice)} / ชิ้น
                        {item.refundedQty > 0 && (
                          <span className="ml-2 text-orange-500">คืนไปแล้ว {item.refundedQty}</span>
                        )}
                      </p>
                    </div>

                    {/* Qty control */}
                    {line.selected && (
                      <div
                        className="flex items-center gap-1 flex-shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40"
                          onClick={() => setQty(item.id, line.qty - 1, remaining)}
                          disabled={line.qty <= 1}
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-8 text-center text-sm font-bold tabular-nums">{line.qty}</span>
                        <button
                          className="h-7 w-7 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-slate-100 disabled:opacity-40"
                          onClick={() => setQty(item.id, line.qty + 1, remaining)}
                          disabled={line.qty >= remaining}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                        <span className="text-xs text-slate-400 ml-1">/{remaining}</span>
                      </div>
                    )}
                    {!line.selected && (
                      <span className="text-xs text-slate-400 flex-shrink-0">คงเหลือ {remaining}</span>
                    )}
                  </div>
                </div>
              )
            })}

            {refundableItems.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-4">ไม่มีรายการที่คืนได้</p>
            )}

            {/* Items already fully refunded */}
            {sale.items.filter((i) => i.refundedQty >= i.quantity).map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-100 dark:border-slate-700/40 p-3 opacity-40">
                <div className="flex items-center gap-3">
                  <div className="h-4 w-4 rounded border-2 border-slate-200 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium line-through">{item.product?.name ?? 'สินค้า'}</p>
                  </div>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">คืนครบแล้ว</span>
                </div>
              </div>
            ))}
          </div>

          {/* Total refund */}
          {selectedItems.length > 0 && (
            <div className="rounded-xl bg-orange-50 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/40 px-4 py-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-orange-700 dark:text-orange-400">ยอดที่จะคืน</span>
                <span className="text-lg font-bold text-orange-700 dark:text-orange-400 tabular-nums">
                  {formatThaiMoney(totalRefund)}
                </span>
              </div>
            </div>
          )}

          {/* Payment method */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">คืนเงินโดย</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['CASH', 'TRANSFER', 'CARD'] as PaymentMethod[]).map((method) => {
                const Icon = PM_ICON[method]
                return (
                  <button
                    key={method}
                    type="button"
                    onClick={() => setPm(method)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-semibold transition-colors',
                      pm === method
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                        : 'border-slate-200 dark:border-slate-700/60 text-slate-500 hover:bg-slate-50',
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {PM_LABEL[method]}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label>เหตุผล <span className="text-red-500">*</span></Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="เช่น ลูกค้าเปลี่ยนใจ / สินค้าชำรุด"
            />
            {reason.length > 0 && reason.trim().length < 3 && (
              <p className="text-xs text-red-500">กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร</p>
            )}
          </div>

          {/* Note (optional) */}
          <div className="space-y-1.5">
            <Label className="text-slate-500">หมายเหตุ <span className="text-slate-400">(ไม่บังคับ)</span></Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="บันทึกเพิ่มเติม..."
            />
          </div>
        </div>

        <DialogFooter className="pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>ยกเลิก</Button>
          <Button
            className="bg-orange-600 hover:bg-orange-700 text-white"
            disabled={!canSubmit || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? 'กำลังดำเนินการ...' : `ยืนยันคืน ${selectedItems.length > 0 ? formatThaiMoney(totalRefund) : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Sale detail dialog ────────────────────────────────────────────────────────

function SaleDetailDialog({
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
  const PMIcon   = PM_ICON[sale.paymentMethod as PaymentMethod] ?? Banknote
  const isVoided   = sale.status === 'VOIDED'
  const isRefunded = sale.status === 'REFUNDED'
  const isPartial  = sale.status === 'PARTIAL_REFUND'
  const hasRefundable = sale.items.some((i) => i.refundedQty < i.quantity)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span className="font-mono text-blue-700">{sale.receiptNumber}</span>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </DialogTitle>
          <p className="text-sm text-slate-400">
            {format(new Date(sale.createdAt), 'dd MMMM yyyy HH:mm', { locale: th })}
            {sale.user && ` · ${sale.user.name}`}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Status badges */}
          {isVoided && (
            <div className="rounded-xl bg-red-50 border border-red-200 px-3 py-2.5 space-y-1">
              <p className="text-sm font-bold text-red-700">ยกเลิกบิลแล้ว</p>
              {sale.voidReason && <p className="text-xs text-red-600">เหตุผล: {sale.voidReason}</p>}
            </div>
          )}
          {(isPartial || isRefunded) && (
            <div className="rounded-xl bg-orange-50 border border-orange-200 px-3 py-2.5">
              <p className="text-sm font-bold text-orange-700">
                {isRefunded ? 'คืนเงินครบแล้ว' : 'คืนเงินบางส่วนแล้ว'}
              </p>
            </div>
          )}

          {/* Customer */}
          {sale.customer && (
            <div className="text-sm text-slate-600">
              ลูกค้า: <span className="font-semibold">{sale.customer.name}</span>
              {sale.customer.phone && <span className="ml-2 text-slate-400">{sale.customer.phone}</span>}
            </div>
          )}

          {/* Items */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/40 p-3 space-y-2">
            {sale.items.map((item) => {
              const fullyRefunded = item.refundedQty >= item.quantity
              return (
                <div key={item.id} className={cn('flex items-start gap-2', fullyRefunded && 'opacity-50')}>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-sm font-semibold leading-tight', fullyRefunded && 'line-through')}>
                      {item.product?.name ?? 'สินค้า'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {item.quantity} × {formatThaiMoney(Number(item.price))}
                      {Number(item.discount) > 0 && ` (ลด ${formatThaiMoney(Number(item.discount))})`}
                      {item.refundedQty > 0 && (
                        <span className="ml-2 text-orange-500">คืน {item.refundedQty}</span>
                      )}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-sm font-bold tabular-nums">{formatThaiMoney(Number(item.total))}</span>
                    {fullyRefunded && (
                      <p className="text-[10px] text-orange-500 font-medium">คืนครบแล้ว</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Totals */}
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
            <div className="flex justify-between font-bold text-base border-t pt-1.5">
              <span>ยอดสุทธิ</span>
              <span className="tabular-nums text-blue-700">{formatThaiMoney(Number(sale.total))}</span>
            </div>
          </div>

          {/* Payment */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 p-3 space-y-1.5">
            {sale.payments && sale.payments.length > 1 ? (
              sale.payments.map((leg, i) => (
                <div key={leg.id} className="flex justify-between text-sm">
                  <span className="text-slate-500">ช่องทาง {i + 1} ({PM_LABEL[leg.paymentMethod as PaymentMethod] ?? leg.paymentMethod})</span>
                  <span className="tabular-nums font-semibold">{formatThaiMoney(Number(leg.amount))}</span>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-slate-500">
                  <PMIcon className="h-4 w-4" />
                  {PM_LABEL[sale.paymentMethod as PaymentMethod] ?? sale.paymentMethod}
                </span>
                <span className="tabular-nums font-semibold">{formatThaiMoney(Number(sale.amountPaid))}</span>
              </div>
            )}
            {Number(sale.change) > 0 && (
              <div className="flex justify-between text-sm text-green-700 dark:text-green-400">
                <span>เงินทอน</span>
                <span className="tabular-nums">{formatThaiMoney(Number(sale.change))}</span>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        {canVoid && !isVoided && (hasRefundable || !isRefunded) && (
          <DialogFooter className="pt-2 border-t flex gap-2">
            {hasRefundable && (
              <Button
                variant="outline"
                size="sm"
                className="border-orange-300 text-orange-600 hover:bg-orange-50"
                onClick={onRefundRequest}
              >
                <RotateCcw className="h-4 w-4 mr-1.5" />
                คืนสินค้า
              </Button>
            )}
            {!isRefunded && !isPartial && (
              <Button variant="destructive" size="sm" onClick={onVoidRequest}>
                <X className="h-4 w-4 mr-1.5" />
                ยกเลิกบิล
              </Button>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SalesHistoryPage() {
  const { hasPermission } = useAuthStore()
  const qc = useQueryClient()

  const [dateStr,      setDateStr]      = useState(todayStr)
  const [search,       setSearch]       = useState('')
  const [selected,     setSelected]     = useState<Sale | null>(null)
  const [voidTarget,   setVoidTarget]   = useState<Sale | null>(null)
  const [refundTarget, setRefundTarget] = useState<Sale | null>(null)

  const canVoid = hasPermission('sales.refund')

  const { data: sales = [], isLoading, refetch, isRefetching } = useQuery<Sale[]>({
    queryKey: ['sales-history-web', dateStr],
    queryFn: async () => {
      const res = await api.get('/sales', { params: { date: dateStr } })
      return Array.isArray(res.data) ? res.data : (res.data?.items ?? [])
    },
  })

  const sorted = useMemo(
    () => [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sales],
  )

  const filtered = useMemo(() => {
    if (!search.trim()) return sorted
    const q = search.toLowerCase()
    return sorted.filter(
      (s) =>
        s.receiptNumber.toLowerCase().includes(q) ||
        s.customer?.name?.toLowerCase().includes(q) ||
        s.customer?.phone?.includes(q),
    )
  }, [sorted, search])

  const totalRevenue = useMemo(
    () => sorted.filter((s) => s.status !== 'VOIDED').reduce((sum, s) => sum + Number(s.total), 0),
    [sorted],
  )
  const voidedCount = useMemo(() => sorted.filter((s) => s.status === 'VOIDED').length, [sorted])

  function handleVoidSuccess() {
    qc.invalidateQueries({ queryKey: ['sales-history-web', dateStr] })
    setSelected(null)
  }

  function handleRefundSuccess() {
    qc.invalidateQueries({ queryKey: ['sales-history-web', dateStr] })
    setSelected(null)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0F172A] shrink-0">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">ประวัติการขาย</h1>
          {!isLoading && (
            <p className="text-sm text-slate-500 mt-0.5">
              {sorted.length} รายการ
              {voidedCount > 0 && <span className="ml-2 text-red-500">· ยกเลิก {voidedCount}</span>}
              <span className="ml-2 font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                รวม {formatThaiMoney(totalRevenue)}
              </span>
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={cn('h-4 w-4 mr-1.5', isRefetching && 'animate-spin')} />
          รีเฟรช
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#0F172A] shrink-0">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-slate-500 shrink-0">วันที่</Label>
          <Input
            type="date"
            value={dateStr}
            max={todayStr()}
            onChange={(e) => setDateStr(e.target.value)}
            className="h-9 w-44"
          />
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="ค้นหาเลขที่บิล / ชื่อลูกค้า..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800/40 animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-60 text-slate-400">
            <Receipt className="h-12 w-12 mb-3 opacity-20" />
            <p className="font-medium">ไม่มีรายการขาย</p>
            <p className="text-sm mt-1 opacity-70">
              {search ? 'ไม่พบผลลัพธ์ที่ค้นหา' : 'ไม่มีรายการในวันที่เลือก'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((sale) => {
              const PMIcon   = PM_ICON[sale.paymentMethod as PaymentMethod] ?? Banknote
              const isVoided = sale.status === 'VOIDED'
              const isPartial  = sale.status === 'PARTIAL_REFUND'
              const isRefunded = sale.status === 'REFUNDED'

              return (
                <button
                  key={sale.id}
                  onClick={() => setSelected(sale)}
                  className={cn(
                    'w-full flex items-center gap-4 rounded-xl border px-4 py-3 text-left bg-white dark:bg-[#1E293B] hover:border-blue-300 dark:hover:border-blue-600 transition-colors',
                    isVoided
                      ? 'border-slate-200 dark:border-slate-700/60 opacity-50'
                      : 'border-slate-200 dark:border-slate-700/60',
                  )}
                >
                  {/* Time */}
                  <span className="text-xs tabular-nums text-slate-400 shrink-0 w-12">
                    {format(new Date(sale.createdAt), 'HH:mm')}
                  </span>

                  {/* Receipt # + badges */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm font-bold text-blue-700 dark:text-blue-400">
                        {sale.receiptNumber}
                      </span>
                      {isVoided && (
                        <span className="text-[10px] bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400 px-1.5 py-0.5 rounded-full font-bold">
                          ยกเลิก
                        </span>
                      )}
                      {isPartial && (
                        <span className="text-[10px] bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 px-1.5 py-0.5 rounded-full font-bold">
                          คืนบางส่วน
                        </span>
                      )}
                      {isRefunded && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300 px-1.5 py-0.5 rounded-full font-bold">
                          คืนเงินแล้ว
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {sale.items.reduce((s, i) => s + i.quantity, 0)} ชิ้น
                      {sale.customer && ` · ${sale.customer.name}`}
                      {sale.user && ` · ${sale.user.name}`}
                    </p>
                  </div>

                  {/* Payment + amount */}
                  <div className="flex items-center gap-2 shrink-0">
                    <PMIcon className="h-4 w-4 text-slate-400" />
                    <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
                      {formatThaiMoney(Number(sale.total))}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Detail dialog */}
      {selected && (
        <SaleDetailDialog
          sale={selected}
          canVoid={canVoid}
          onClose={() => setSelected(null)}
          onVoidRequest={() => {
            setVoidTarget(selected)
            setSelected(null)
          }}
          onRefundRequest={() => {
            setRefundTarget(selected)
            setSelected(null)
          }}
        />
      )}

      {/* Void confirm dialog */}
      {voidTarget && (
        <VoidDialog
          sale={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={handleVoidSuccess}
        />
      )}

      {/* Partial refund dialog */}
      {refundTarget && (
        <RefundDialog
          sale={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={handleRefundSuccess}
        />
      )}
    </div>
  )
}
