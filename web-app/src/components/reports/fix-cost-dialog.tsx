'use client'

/**
 * The owner fixes a cost typed wrong (or never typed) from the profit report: the product's cost,
 * and if ticked the bills already sold with a plainly wrong cost (0, or above what they sold for).
 * Bills sold at a sensible cost keep it. Every fix is kept in the history (audit log).
 */
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { apiErrorMessage, formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

interface Preview {
  product: { id: string; name: string; price: number; costPrice: number }
  lines: { id: string; saleId: string; receiptNumber: string; date: string; quantity: number; soldFor: number; costPrice: number; isFreebie: boolean }[]
  profitChange: number | null
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' })

export function FixCostDialog({ productId, onClose }: { productId: string | null; onClose: () => void }) {
  const qc = useQueryClient()
  const [cost, setCost] = useState('')
  const [fixBills, setFixBills] = useState(true)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ linesFixed: number; profitChange: number } | null>(null)
  const value = Number(cost)
  const valid = cost !== '' && Number.isFinite(value) && value > 0

  useEffect(() => { setCost(''); setFixBills(true); setError(''); setDone(null) }, [productId])

  const { data, isLoading } = useQuery<Preview>({
    queryKey: ['fix-cost-preview', productId, valid ? value : null],
    queryFn: () => api.get('/reports/fix-cost/preview', { params: { productId, ...(valid ? { costPrice: value } : {}) } }).then((r) => r.data),
    enabled: !!productId,
    placeholderData: (prev) => prev,
  })

  const save = useMutation({
    mutationFn: () => api.post('/reports/fix-cost', { productId, costPrice: value, fixBills }).then((r) => r.data),
    onSuccess: (r) => {
      setDone({ linesFixed: r.linesFixed, profitChange: r.profitChange })
      qc.invalidateQueries({ queryKey: ['profit-report'] })
      qc.invalidateQueries({ queryKey: ['products'] })
    },
    onError: (e) => setError(apiErrorMessage(e)),
  })

  const p = data?.product
  const lines = data?.lines ?? []
  const change = fixBills ? data?.profitChange ?? null : 0
  const aboveSell = p && valid && value > p.price

  return (
    <Dialog open={!!productId} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>แก้ราคาทุน</DialogTitle>
          <DialogDescription>{p ? p.name : 'กำลังโหลด…'}</DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <div className="rounded-xl bg-green-50 p-4 text-sm text-green-900 dark:bg-green-900/20 dark:text-green-200">
              <p className="font-bold">บันทึกแล้ว — ทุนใหม่ {formatThaiMoney(value)} ต่อชิ้น</p>
              <p className="mt-1">
                {done.linesFixed > 0
                  ? <>แก้บิลเก่า {done.linesFixed} บิล · กำไร{done.profitChange >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} {formatThaiMoney(Math.abs(done.profitChange))}</>
                  : 'บิลเก่าไม่ได้เปลี่ยน ใช้ทุนใหม่กับการขายครั้งต่อไป'}
              </p>
            </div>
            <Button className="w-full" onClick={onClose}>ปิด</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {p && (
              <p className="text-sm text-muted-foreground">
                ตอนนี้ทุน <b className={p.costPrice <= 0 || p.costPrice > p.price ? 'text-red-600' : 'text-foreground'}>{formatThaiMoney(p.costPrice)}</b> · ราคาขาย {formatThaiMoney(p.price)}
              </p>
            )}
            <label className="block">
              <span className="text-sm font-semibold">ทุนที่ถูกต้องต่อชิ้น (บาท)</span>
              <input
                type="number" inputMode="decimal" min={0} step="0.01" autoFocus value={cost}
                onChange={(e) => { setCost(e.target.value); setError('') }}
                className="mt-1 h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-lg tabular-nums dark:border-slate-600 dark:bg-slate-900"
                placeholder="เช่น 15000"
              />
              {aboveSell && <span className="mt-1 block text-xs font-semibold text-amber-700">ทุนสูงกว่าราคาขาย — ตรวจอีกครั้งว่าไม่ได้พิมพ์ 0 เกิน</span>}
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input type="checkbox" className="mt-1 h-5 w-5" checked={fixBills} onChange={(e) => setFixBills(e.target.checked)} disabled={!lines.length} />
              <span className="text-sm">
                <b>แก้บิลที่ขายไปแล้วด้วย ({lines.length} บิล)</b>
                <span className="block text-xs text-muted-foreground">
                  {lines.length
                    ? 'เฉพาะบิลที่ทุนเป็น 0 หรือสูงกว่าราคาที่ขาย · ยอดที่ลูกค้าจ่ายไม่เปลี่ยน บิลที่ทุนปกติไม่แตะ'
                    : 'ไม่มีบิลเก่าที่ทุนผิด'}
                </span>
              </span>
            </label>

            {fixBills && lines.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 text-xs dark:border-slate-700">
                {lines.map((l) => (
                  <div key={l.id} className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5 last:border-0 dark:border-slate-700">
                    <span className="font-mono">{l.receiptNumber}</span>
                    <span className="text-muted-foreground">{shortDate(l.date)}</span>
                    <span className="tabular-nums">ขาย {formatThaiMoney(l.soldFor)} · ทุน <b className="text-red-600">{formatThaiMoney(l.costPrice)}</b></span>
                  </div>
                ))}
              </div>
            )}

            {valid && fixBills && change != null && lines.length > 0 && (
              <p className="text-sm">กำไรของบิลเหล่านี้จะ{change >= 0 ? 'เพิ่มขึ้น' : 'ลดลง'} <b className={change >= 0 ? 'text-green-700' : 'text-red-600'}>{formatThaiMoney(Math.abs(change))}</b></p>
            )}
            {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

            <Button className="h-12 w-full text-base" disabled={!valid || save.isPending || isLoading} onClick={() => save.mutate()}>
              {save.isPending ? 'กำลังบันทึก…' : 'บันทึกทุนใหม่'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">เก็บประวัติการแก้ไว้ทุกครั้ง</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
