'use client'

import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Banknote, Smartphone, CreditCard, Receipt, RefreshCw,
  X, AlertTriangle, RotateCcw, ChevronRight, Search,
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

// ── Sale detail dialog ────────────────────────────────────────────────────────

function SaleDetailDialog({
  sale,
  canVoid,
  onClose,
  onVoidRequest,
}: {
  sale: Sale
  canVoid: boolean
  onClose: () => void
  onVoidRequest: () => void
}) {
  const PMIcon   = PM_ICON[sale.paymentMethod as PaymentMethod] ?? Banknote
  const isVoided = sale.status === 'VOIDED'
  const isRefunded   = sale.status === 'REFUNDED'
  const isPartial    = sale.status === 'PARTIAL_REFUND'

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
            {sale.items.map((item) => (
              <div key={item.id} className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{item.product?.name ?? 'สินค้า'}</p>
                  <p className="text-xs text-slate-400">
                    {item.quantity} × {formatThaiMoney(Number(item.price))}
                    {Number(item.discount) > 0 && ` (ลด ${formatThaiMoney(Number(item.discount))})`}
                  </p>
                </div>
                <span className="text-sm font-bold tabular-nums shrink-0">{formatThaiMoney(Number(item.total))}</span>
              </div>
            ))}
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
        {canVoid && !isVoided && !isRefunded && (
          <DialogFooter className="pt-2 border-t">
            <Button variant="destructive" size="sm" onClick={onVoidRequest}>
              <X className="h-4 w-4 mr-1.5" />
              ยกเลิกบิล
            </Button>
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

  const [dateStr,    setDateStr]    = useState(todayStr)
  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<Sale | null>(null)
  const [voidTarget, setVoidTarget] = useState<Sale | null>(null)

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
    </div>
  )
}
