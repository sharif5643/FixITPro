'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { Banknote, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { cn, formatThaiMoney } from '@/lib/utils'

type ShiftSale = {
  id: string
  receiptNumber: string
  createdAt: string
  total: string | number
  status: string
  payments?: { paymentMethod: string; amount: string | number }[]
  items?: { product?: { name: string } | null }[]
}

/** Cash bills at least this big are worth a second look before the count */
export const BIG_CASH_BILL = 3000

/**
 * Before the cash count: the shift's big cash bills, so a sale paid by transfer but keyed as cash
 * (or the other way round) can be put right first — otherwise the count can never match.
 */
export function CashBillReview({ shiftId, className }: { shiftId: string; className?: string }) {
  const qc = useQueryClient()
  const { data } = useQuery<{ items: ShiftSale[] }>({
    queryKey: ['sales', 'shift-review', shiftId],
    queryFn: async () => (await api.get('/sales', { params: { shiftId, limit: 200 } })).data,
    staleTime: 0,
  })
  const bills = (data?.items ?? []).filter((s) =>
    s.status === 'COMPLETED'
    && s.payments?.length === 1
    && s.payments[0].paymentMethod === 'CASH'
    && Number(s.total) >= BIG_CASH_BILL,
  )

  const change = useMutation({
    mutationFn: ({ id, method }: { id: string; method: 'TRANSFER' | 'CARD' }) =>
      api.post(`/sales/${id}/payment-method`, { paymentMethod: method }),
    onSuccess: (_r, v) => {
      toast.success(v.method === 'TRANSFER' ? 'เปลี่ยนเป็นเงินโอนแล้ว — ยอดเงินสดที่คาดอัปเดตแล้ว' : 'เปลี่ยนเป็นบัตรแล้ว')
      qc.invalidateQueries({ queryKey: ['sales'] })
      qc.invalidateQueries({ queryKey: ['shifts'] })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'แก้ไม่สำเร็จ'))
    },
  })

  if (bills.length === 0) return null
  return (
    <div className={cn('rounded-xl border border-sky-200 bg-sky-50 p-3 text-sm dark:border-sky-800 dark:bg-sky-900/20', className)}>
      <p className="flex items-center gap-1.5 font-semibold text-sky-900 dark:text-sky-200">
        <Banknote className="h-4 w-4" /> ตรวจบิลเงินสดยอดสูงก่อนนับเงิน ({bills.length})
      </p>
      <p className="mb-2 text-xs text-sky-800/80 dark:text-sky-300/80">ลูกค้าโอนมาแต่กดเป็นเงินสด? แก้ตรงนี้ได้ก่อนปิดกะ</p>
      <div className="space-y-1.5">
        {bills.map((b) => (
          <div key={b.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 dark:bg-slate-900/50">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{b.items?.[0]?.product?.name ?? b.receiptNumber}{(b.items?.length ?? 0) > 1 ? ` +${(b.items?.length ?? 1) - 1}` : ''}</p>
              <p className="text-[11px] text-muted-foreground">{format(new Date(b.createdAt), 'HH:mm')} · เงินสด</p>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums">{formatThaiMoney(Number(b.total))}</span>
            <button
              type="button"
              disabled={change.isPending}
              onClick={() => change.mutate({ id: b.id, method: 'TRANSFER' })}
              className="shrink-0 rounded-lg border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100 disabled:opacity-50 dark:text-sky-200"
            >
              {change.isPending && change.variables?.id === b.id ? <Loader2 className="h-3 w-3 animate-spin" /> : 'เป็นเงินโอน'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
