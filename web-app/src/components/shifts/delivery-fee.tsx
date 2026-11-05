'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Search, Truck, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage, cn, formatThaiMoney } from '@/lib/utils'

/**
 * "จ่ายค่ารถ": the fee paid to the driver who brings the parts (e.g. สองแถว ฿80, paid on arrival).
 * For the job the parts were ordered for → that job's cost; otherwise a shop expense
 * ("ค่าขนส่งอะไหล่"). Paid from the drawer (the shift's cash goes down) or by the owner.
 */

const LAST_KEY = 'delivery_fee_last'
const lastFee = () => {
  try { return Number(localStorage.getItem(LAST_KEY)) || 80 } catch { return 80 }
}

type RepairHit = { id: string; ticketNumber: string; deviceBrand?: string | null; deviceModel?: string | null; customer?: { name?: string | null } | null }

export function DeliveryFeeButton({ className, label = '🚐 จ่ายค่ารถ', disabled }: { className?: string; label?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} className={className}>{label}</button>
      {open && <DeliveryFeeSheet onClose={() => setOpen(false)} />}
    </>
  )
}

export function DeliveryFeeSheet({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState('80')
  const [fromDrawer, setFromDrawer] = useState(true)
  const [note, setNote] = useState('')
  const [q, setQ] = useState('')
  const [job, setJob] = useState<RepairHit | null>(null)
  useEffect(() => { setAmount(String(lastFee())) }, [])

  const { data: hits = [], isFetching } = useQuery<RepairHit[]>({
    queryKey: ['repairs', 'delivery-pick', q.trim()],
    queryFn: async () => {
      const res = await api.get('/repairs', { params: { search: q.trim(), limit: 6 } })
      return Array.isArray(res.data) ? res.data : res.data?.items ?? res.data?.data ?? []
    },
    enabled: q.trim().length >= 2 && !job,
    staleTime: 15_000,
  })

  const save = useMutation({
    mutationFn: async () => (await api.post('/shifts/delivery-fee', {
      amount: Number(amount), repairId: job?.id, fromDrawer, note: note.trim() || undefined,
    })).data,
    onSuccess: () => {
      try { localStorage.setItem(LAST_KEY, String(Number(amount))) } catch { /* not remembered */ }
      toast.success(job ? `บันทึกค่ารถ ${formatThaiMoney(Number(amount))} เป็นต้นทุนงาน ${job.ticketNumber}` : `บันทึกค่ารถ ${formatThaiMoney(Number(amount))} เป็นค่าใช้จ่ายร้าน`)
      for (const k of [['shifts'], ['profit-report'], ['expenses'], ['repairs'], ['daily-closing']]) qc.invalidateQueries({ queryKey: k })
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })

  const amt = Number(amount)
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-4 sm:rounded-3xl dark:bg-slate-900" style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex items-center gap-2">
          <Truck className="h-5 w-5 text-amber-600" />
          <p className="flex-1 text-lg font-bold">จ่ายค่ารถส่งอะไหล่</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>

        <label className="text-sm font-semibold">ค่ารถรอบนี้ (บาท)</label>
        <input type="number" inputMode="numeric" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
          className="mt-1 h-14 w-full rounded-xl border-2 border-slate-200 px-4 text-right text-3xl font-bold tabular-nums outline-none focus:border-amber-500 dark:border-slate-700 dark:bg-slate-800" />

        <p className="mt-4 text-sm font-semibold">เป็นของงานซ่อมไหน <span className="font-normal text-muted-foreground">(ไม่บังคับ)</span></p>
        {job ? (
          <div className="mt-1 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-700 dark:bg-amber-900/20">
            <span className="min-w-0 flex-1 truncate"><b>{job.ticketNumber}</b> · {job.deviceBrand} {job.deviceModel}{job.customer?.name ? ` · ${job.customer.name}` : ''}</span>
            <button type="button" onClick={() => setJob(null)} className="text-xs font-semibold text-red-600">เอาออก</button>
          </div>
        ) : (
          <>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="เลขงาน / ชื่อลูกค้า / รุ่นเครื่อง"
                className="h-11 w-full rounded-xl border border-slate-200 pl-9 pr-9 text-sm outline-none focus:border-amber-400 dark:border-slate-700 dark:bg-slate-800" />
              {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400" />}
            </div>
            {hits.length > 0 && (
              <div className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700">
                {hits.map((r) => (
                  <button key={r.id} type="button" onClick={() => { setJob(r); setQ('') }}
                    className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20">
                    <b>{r.ticketNumber}</b> · {r.deviceBrand} {r.deviceModel}{r.customer?.name ? ` · ${r.customer.name}` : ''}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-muted-foreground">ไม่เลือก = นับเป็นค่าใช้จ่ายร้าน “ค่าขนส่งอะไหล่”</p>
          </>
        )}

        <p className="mt-4 text-sm font-semibold">จ่ายจาก</p>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {([[true, '💵 เงินในลิ้นชัก'], [false, '👤 เจ้าของจ่ายเอง']] as const).map(([v, label]) => (
            <button key={String(v)} type="button" onClick={() => setFromDrawer(v)}
              className={cn('h-11 rounded-xl border-2 text-sm font-bold', fromDrawer === v ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200' : 'border-slate-200 text-slate-600 dark:border-slate-700')}>
              {label}
            </button>
          ))}
        </div>

        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="หมายเหตุ (ไม่บังคับ) เช่น ร้านอะไหล่ X รอบบ่าย" maxLength={200}
          className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-amber-400 dark:border-slate-700 dark:bg-slate-800" />

        <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {job ? `เป็นต้นทุนของงาน ${job.ticketNumber} — กำไรของงานนี้จะหักค่ารถด้วย` : 'เป็นค่าใช้จ่ายร้าน — หักจากกำไรรวม'}
          {fromDrawer ? ' · หักเงินออกจากลิ้นชักของกะนี้ ยอดปิดกะจะได้ตรง' : ' · ไม่หักจากลิ้นชัก'}
        </p>

        <button type="button" disabled={!(amt >= 1) || save.isPending} onClick={() => save.mutate()}
          className="mt-3 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-amber-600 text-lg font-bold text-white hover:bg-amber-700 disabled:opacity-50">
          {save.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
          บันทึกค่ารถ {amt >= 1 ? formatThaiMoney(amt) : ''}
        </button>
      </div>
    </div>
  )
}
