'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Receipt, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { formatThaiMoney, apiErrorMessage } from '@/lib/utils'
import api from '@/lib/api'
import { useIntentKey } from '@/lib/intent-key'

export interface WithholdingTaxRow {
  id: string
  amount: number | string
  ratePercent: number | string
  baseAmount: number | string
  payerName: string
  payerTaxId?: string | null
  certificateNo?: string | null
  certificateDate: string
  cancelledAt?: string | null
  cancelReason?: string | null
}

export const whtKey = (repairId: string) => ['repairs', repairId, 'withholding-tax']

/** Certificates on a job, and how much of the bill they settle (cancelled ones do not count) */
export function useWithholdingTax(repairId: string, enabled = true) {
  const q = useQuery<WithholdingTaxRow[]>({
    queryKey: whtKey(repairId),
    queryFn:  () => api.get(`/withholding-tax/repair/${repairId}`).then((r) => r.data),
    enabled:  !!repairId && enabled,
  })
  const rows = q.data ?? []
  const total = rows.filter((r) => !r.cancelledAt).reduce((s, r) => s + Number(r.amount), 0)
  return { rows, total: Math.round(total * 100) / 100 }
}

const todayBkk = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * An agency (1%) or a company (3%) pays the bill less the tax and hands over a certificate
 * (หนังสือรับรองการหักภาษี ณ ที่จ่าย / 50 ทวิ). Recording it settles that part of the job without
 * cash: no drawer, no shift. The shop keeps the certificate to claim the tax back.
 */
export function WithholdingTaxBox({ repairId, outstanding, canRecord, canManage }: {
  repairId: string
  /** What is still owed after cash and earlier certificates */
  outstanding: number
  /** The job is delivered and still owes money */
  canRecord: boolean
  /** Owner or manager */
  canManage: boolean
}) {
  const qc = useQueryClient()
  const { rows } = useWithholdingTax(repairId)
  const [open, setOpen] = useState(false)
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [reason, setReason] = useState('')

  const refresh = () => {
    qc.invalidateQueries({ queryKey: whtKey(repairId) })
    qc.invalidateQueries({ queryKey: ['repairs', repairId] })
    qc.invalidateQueries({ queryKey: ['repairs'] })
    // the same job as the SUNMI and staff apps hold it
    qc.invalidateQueries({ queryKey: ['repair-detail', repairId] })
    qc.invalidateQueries({ queryKey: ['staff-repair', repairId] })
    qc.invalidateQueries({ queryKey: ['staff-repairs'] })
  }

  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/withholding-tax/${id}/cancel`, { reason }),
    onSuccess: () => { toast.success('ยกเลิกแล้ว — ยอดนี้กลับไปเป็นยอดค้าง'); setCancelId(null); setReason(''); refresh() },
    onError: (e) => toast.error(apiErrorMessage(e, 'ยกเลิกไม่สำเร็จ')),
  })

  if (!canManage || (!rows.length && !canRecord)) return null

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-800/60 bg-sky-50/60 dark:bg-sky-900/10 p-3 space-y-1.5 text-sm">
          <div className="font-semibold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
            <Receipt className="h-4 w-4" /> ภาษีหัก ณ ที่จ่าย
          </div>
          {rows.map((r) => (
            <div key={r.id} className={`flex items-start justify-between gap-2 ${r.cancelledAt ? 'opacity-60' : ''}`}>
              <div className="min-w-0">
                <div className={r.cancelledAt ? 'line-through' : ''}>
                  {r.payerName} · {Number(r.ratePercent)}%{r.certificateNo ? ` · เลขที่ ${r.certificateNo}` : ''}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(r.certificateDate).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' })}
                  {r.cancelledAt ? ` · ยกเลิกแล้ว: ${r.cancelReason ?? ''}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="tabular-nums font-medium">{formatThaiMoney(Number(r.amount))}</span>
                {!r.cancelledAt && (
                  <button type="button" aria-label="ยกเลิกรายการนี้" className="p-1 rounded hover:bg-sky-100 dark:hover:bg-sky-800/40 text-muted-foreground"
                    onClick={() => { setCancelId(r.id); setReason('') }}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {canRecord && outstanding > 0 && (
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={() => setOpen(true)}>
          <Receipt className="h-3.5 w-3.5" /> ลูกค้าหักภาษี ณ ที่จ่าย (มีหนังสือรับรอง 50 ทวิ)
        </Button>
      )}

      {open && <RecordDialog repairId={repairId} outstanding={outstanding} onClose={() => setOpen(false)} onDone={() => { setOpen(false); refresh() }} />}

      <Dialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>ยกเลิกรายการภาษีหัก ณ ที่จ่าย</DialogTitle>
            <DialogDescription>รายการจะยังเก็บไว้ (ขีดฆ่า) และยอดนี้จะกลับไปเป็นยอดที่ลูกค้ายังค้าง</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="wht-cancel-reason">เหตุผล</Label>
            <Input id="wht-cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ใส่ผิดงาน / ยอดผิด" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelId(null)}>ไม่ยกเลิก</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancelId && cancel.mutate(cancelId)}>
              {cancel.isPending ? 'กำลังยกเลิก…' : 'ยืนยันยกเลิก'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function RecordDialog({ repairId, outstanding, onClose, onDone }: { repairId: string; outstanding: number; onClose: () => void; onDone: () => void }) {
  const [rate, setRate] = useState<number>(3)
  // Tax is withheld on the price before VAT; for a shop without VAT that is the bill itself
  const [base, setBase] = useState<string>(String(r2(outstanding / (rate / 100))))
  const [amount, setAmount] = useState<string>(String(r2(outstanding)))
  const [payerName, setPayerName] = useState('')
  const [payerTaxId, setPayerTaxId] = useState('')
  const [certNo, setCertNo] = useState('')
  const [date, setDate] = useState(todayBkk())

  const pickRate = (r: number) => {
    setRate(r)
    const b = Number(base)
    if (b > 0 && r > 0) setAmount(String(r2(b * r / 100)))
  }
  const changeBase = (v: string) => {
    setBase(v)
    const b = Number(v)
    if (b > 0 && rate > 0) setAmount(String(r2(b * rate / 100)))
  }

  const amt = r2(Number(amount))
  const tooMuch = amt > outstanding + 0.005
  const valid = amt > 0 && !tooMuch && payerName.trim().length > 0 && !!date

  const saveKey = useIntentKey()
  const save = useMutation({
    mutationFn: () => api.post(`/withholding-tax/repair/${repairId}`, {
      amount: amt, ratePercent: rate, baseAmount: r2(Number(base) || 0),
      payerName: payerName.trim(), payerTaxId: payerTaxId.trim() || undefined,
      certificateNo: certNo.trim() || undefined, certificateDate: date,
    }, { headers: saveKey.headers() }),
    onSuccess: () => {
      saveKey.renew()
      toast.success(amt >= outstanding - 0.005 ? 'บันทึกแล้ว — งานนี้ชำระครบ' : 'บันทึกแล้ว')
      onDone()
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'บันทึกไม่สำเร็จ')),
  })

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>ลูกค้าหักภาษี ณ ที่จ่าย</DialogTitle>
          <DialogDescription>
            หน่วยงานราชการหัก 1% · บริษัทหัก 3% (ค่าบริการ) แล้วให้หนังสือรับรองมา — ยอดนี้ไม่ใช่เงินสด ไม่เข้าลิ้นชัก
            เก็บหนังสือไว้ใช้ขอคืน/หักภาษีตอนยื่นภาษีประจำปี
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>อัตราที่หัก</Label>
            <div className="flex gap-2">
              {[1, 3, 5].map((r) => (
                <Button key={r} type="button" size="sm" variant={rate === r ? 'default' : 'outline'} onClick={() => pickRate(r)}>{r}%</Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wht-base">ยอดก่อนหักภาษี</Label>
              <Input id="wht-base" inputMode="decimal" value={base} onChange={(e) => changeBase(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wht-amount">ภาษีที่ถูกหัก</Label>
              <Input id="wht-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <p className={`text-xs ${tooMuch ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
            {tooMuch ? `เกินยอดที่ยังค้าง (${formatThaiMoney(outstanding)})` : `ยอดที่ยังค้างบนงานนี้ ${formatThaiMoney(outstanding)}`}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="wht-payer">ผู้หักภาษี (หน่วยงาน / บริษัทที่จ่ายเงิน)</Label>
            <Input id="wht-payer" value={payerName} onChange={(e) => setPayerName(e.target.value)} placeholder="เช่น บริษัท ตัวอย่าง จำกัด" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wht-taxid">เลขผู้เสียภาษีผู้หัก</Label>
              <Input id="wht-taxid" inputMode="numeric" value={payerTaxId} onChange={(e) => setPayerTaxId(e.target.value)} placeholder="13 หลัก (ถ้ามี)" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wht-no">เลขที่หนังสือรับรอง</Label>
              <Input id="wht-no" value={certNo} onChange={(e) => setCertNo(e.target.value)} placeholder="ถ้ามี" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wht-date">วันที่ในหนังสือรับรอง</Label>
            <Input id="wht-date" type="date" value={date} max={todayBkk()} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button disabled={!valid || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? 'กำลังบันทึก…' : `บันทึก ${amt > 0 ? formatThaiMoney(amt) : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
