'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RepairPriceChips } from '@/components/repair-prices/repair-price-chips'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

const JOBS = ['เปลี่ยนจอ', 'เปลี่ยนแบต', 'ตูดชาร์จ', 'ลำโพง/ไมค์', 'กล้อง']
const METHODS = [
  { key: 'CASH', label: 'เงินสด' },
  { key: 'TRANSFER', label: 'โอน' },
  { key: 'CARD', label: 'บัตร' },
] as const
const WARRANTY = [0, 7, 30, 90]

/**
 * The customer is paying for a job that never got an intake ticket (busy counter, details on
 * paper): phone, what was done, price — the job is recorded as handed over and paid in one step.
 * The parts it used are taken from stock later, from "รอเบิกอะไหล่".
 */
export function QuickRepairDialog({
  open, onOpenChange, branchId,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  branchId?: string
}) {
  const qc = useQueryClient()
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [model, setModel] = useState('')
  const [issue, setIssue] = useState('')
  const [price, setPrice] = useState('')
  const [method, setMethod] = useState<'CASH' | 'TRANSFER' | 'CARD'>('CASH')
  const [warranty, setWarranty] = useState(30)

  const reset = () => {
    setPhone(''); setName(''); setBrand(''); setModel(''); setIssue(''); setPrice('')
    setMethod('CASH'); setWarranty(30)
  }
  const priceNum = Number(price)

  const save = useMutation({
    mutationFn: async () => (await api.post('/repairs/quick-paid', {
      customerPhone: phone.trim() || undefined,
      customerName: name.trim() || undefined,
      deviceBrand: brand.trim() || undefined,
      deviceModel: model.trim(),
      issue: issue.trim(),
      price: priceNum,
      paymentMethod: method,
      warrantyDays: warranty || undefined,
      ...(branchId ? { branchId } : {}),
    })).data,
    onSuccess: (r: { ticketNumber?: string }) => {
      toast.success(`บันทึกงานซ่อม ${r.ticketNumber ?? ''} — รับเงิน ${priceNum.toLocaleString('th-TH')} บาทแล้ว`, {
        description: 'ตอนเย็นค่อยเบิกอะไหล่ที่ใช้จริง ที่ปุ่ม "รอเบิกอะไหล่"',
      })
      qc.invalidateQueries({ queryKey: ['shifts'] })
      qc.invalidateQueries({ queryKey: ['repairs'] })
      reset()
      onOpenChange(false)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'บันทึกไม่สำเร็จ'))
    },
  })

  const canSave = model.trim().length > 0 && issue.trim().length > 0 && price !== '' && priceNum >= 0 && !save.isPending
  const chip = (on: boolean) => cn(
    'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors active:scale-95',
    on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200',
  )

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🔧 รับเงินค่าซ่อม (ยังไม่มีใบรับ)</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5">
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <p className="mb-1 text-sm font-semibold">เบอร์โทรลูกค้า</p>
              <Input type="tel" inputMode="tel" placeholder="08x-xxx-xxxx" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} />
              <p className="mt-1 text-[11px] text-muted-foreground">เคยมาแล้ว ระบบผูกกับลูกค้าเดิมให้เอง</p>
            </div>
            <div className="col-span-2">
              <Input placeholder="ชื่อลูกค้า (ไม่บังคับ)" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
            </div>
            <Input placeholder="ยี่ห้อ เช่น Samsung" value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={100} />
            <Input placeholder="รุ่น เช่น A10 *" value={model} onChange={(e) => setModel(e.target.value)} maxLength={100} />
          </div>

          <RepairPriceChips
            brand={brand}
            model={model}
            onPick={(p) => {
              setIssue(p.service)
              setPrice(String(p.price))
              if (p.warrantyDays) setWarranty(p.warrantyDays)
            }}
          />

          <div>
            <p className="mb-1 text-sm font-semibold">ซ่อมอะไร</p>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {JOBS.map((j) => (
                <button key={j} type="button" className={chip(issue === j)} onClick={() => setIssue(j)}>{j}</button>
              ))}
            </div>
            <Input placeholder="หรือพิมพ์เอง" value={issue} onChange={(e) => setIssue(e.target.value)} maxLength={500} />
          </div>

          <div>
            <p className="mb-1 text-sm font-semibold">ราคาที่ลูกค้าจ่าย (บาท)</p>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="h-12 text-right text-2xl font-bold tabular-nums"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm font-semibold">รับเงินทาง</span>
            {METHODS.map((m) => (
              <button key={m.key} type="button" className={chip(method === m.key)} onClick={() => setMethod(m.key)}>{m.label}</button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-sm font-semibold">รับประกัน</span>
            {WARRANTY.map((d) => (
              <button key={d} type="button" className={chip(warranty === d)} onClick={() => setWarranty(d)}>{d ? `${d} วัน` : 'ไม่มี'}</button>
            ))}
          </div>

          <Button className="h-12 w-full bg-blue-600 text-base font-bold hover:bg-blue-700" disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            รับเงิน{priceNum > 0 ? ` ${priceNum.toLocaleString('th-TH')} บาท` : ''} · ส่งเครื่องคืน
          </Button>
          <p className="text-center text-[11px] text-muted-foreground">
            งานนี้จะขึ้นว่า "ส่งมอบแล้ว · จ่ายแล้ว" และรอเบิกอะไหล่ตอนเย็น
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
