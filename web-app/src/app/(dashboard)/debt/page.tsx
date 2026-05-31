'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  AlertCircle, Users, Phone, ChevronDown, ChevronUp,
  CreditCard, Clock, CheckCircle2, Printer, X, History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatThaiMoney } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdditionalPayment {
  id: string
  amount: string | number
  paymentMethod: string
  note: string | null
  createdAt: string
  createdBy: { id: string; name: string }
}

interface OutstandingRepair {
  id: string
  ticketNumber: string
  deviceBrand: string
  deviceModel: string
  deviceColor: string | null
  finalCost: string | number | null
  deposit: string | number
  paymentStatus: string
  deliveredAt: string | null
  additionalPayments: AdditionalPayment[]
  outstandingAmount: number
  customer: { id: string; name: string; phone: string | null } | null
}

interface CustomerGroup {
  customerId: string
  name: string
  phone: string | null
  totalDebt: number
  repairs: OutstandingRepair[]
}

interface PaymentResult {
  payment: {
    id: string
    amount: string | number
    paymentMethod: string
    note: string | null
    createdAt: string
    receiptNumber: string
  }
  repair: {
    id: string
    ticketNumber: string
    deviceBrand: string
    deviceModel: string
    finalCost: number
    deposit: number
    previousPaid: number
    amountPaid: number
    remainingAfter: number
    paymentStatus: string
    customer: { name: string; phone: string | null } | null
  }
  receiptNumber: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'CASH',     label: 'เงินสด',  icon: '💵' },
  { value: 'TRANSFER', label: 'โอนเงิน', icon: '📲' },
  { value: 'CARD',     label: 'บัตร',    icon: '💳' },
]

const PAYMENT_LABEL: Record<string, string> = {
  CASH:     'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD:     'บัตรเครดิต',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: string | number | null | undefined) {
  return formatThaiMoney(Number(v ?? 0))
}

function groupRepairs(repairs: OutstandingRepair[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>()
  for (const r of repairs) {
    const key  = r.customer?.id ?? '__unknown__'
    const name = r.customer?.name ?? 'ไม่ระบุลูกค้า'
    const phone = r.customer?.phone ?? null
    const existing = map.get(key)
    if (existing) {
      existing.totalDebt += r.outstandingAmount
      existing.repairs.push(r)
    } else {
      map.set(key, { customerId: key, name, phone, totalDebt: r.outstandingAmount, repairs: [r] })
    }
  }
  return Array.from(map.values()).sort((a, b) => b.totalDebt - a.totalDebt)
}

// ── Receipt Modal ─────────────────────────────────────────────────────────────

function ReceiptModal({ result, onClose }: { result: PaymentResult; onClose: () => void }) {
  const isPaid = result.repair.paymentStatus === 'PAID'
  const dateStr = format(new Date(result.payment.createdAt), 'dd MMM yyyy HH:mm', { locale: th })

  function handlePrint() {
    const el = document.getElementById('debt-receipt-print')
    if (!el) return
    const win = window.open('', '_blank', 'width=420,height=680,scrollbars=yes')
    if (!win) return
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>ใบเสร็จ ${result.receiptNumber}</title>
      <style>
        body{font-family:'Courier New',monospace;margin:24px;font-size:13px;color:#000}
        .c{text-align:center}.b{font-weight:bold}.sep{border-top:1px dashed #555;margin:8px 0}
        .row{display:flex;justify-content:space-between;margin:3px 0}
        .big{font-size:16px;font-weight:bold}.green{color:#15803d}.red{color:#dc2626}
      </style>
    </head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.focus(); win.print() }, 300)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="font-bold text-slate-800">รับชำระสำเร็จ</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        {/* Receipt content */}
        <div className="overflow-y-auto flex-1 px-5 py-4">
          <div
            id="debt-receipt-print"
            className="font-mono text-sm space-y-1 text-slate-800"
          >
            <p className="c b text-base">FixITPro</p>
            <p className="c text-xs text-slate-400">ใบเสร็จรับเงิน (หนี้ค้างชำระ)</p>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">เลขที่:</span>
              <span className="font-semibold tabular-nums">{result.receiptNumber}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">วันที่:</span>
              <span>{dateStr}</span>
            </div>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">ลูกค้า:</span>
                <span className="font-medium">{result.repair.customer?.name ?? '—'}</span>
              </div>
              {result.repair.customer?.phone && (
                <div className="flex justify-between">
                  <span className="text-slate-400">เบอร์:</span>
                  <span>{result.repair.customer.phone}</span>
                </div>
              )}
            </div>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <div className="text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-400">ใบงาน:</span>
                <span className="font-medium">{result.repair.ticketNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">อุปกรณ์:</span>
                <span>{result.repair.deviceBrand} {result.repair.deviceModel}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ค่าซ่อมรวม:</span>
                <span>{money(result.repair.finalCost)}</span>
              </div>
            </div>
            <div className="border-t border-dashed border-slate-300 my-2" />
            <div className="flex justify-between items-baseline">
              <span className="text-sm font-semibold">รับชำระ:</span>
              <span className="text-lg font-bold text-green-600">{money(result.repair.amountPaid)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">วิธีชำระ:</span>
              <span>{PAYMENT_LABEL[result.payment.paymentMethod] ?? result.payment.paymentMethod}</span>
            </div>
            {result.payment.note && (
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">หมายเหตุ:</span>
                <span>{result.payment.note}</span>
              </div>
            )}
            <div className="border-t border-dashed border-slate-300 my-2" />
            <div className="flex justify-between text-sm font-semibold">
              <span>ยอดคงเหลือ:</span>
              <span className={isPaid ? 'text-green-600' : 'text-red-600'}>
                {isPaid ? '✓ ชำระครบแล้ว' : money(result.repair.remainingAfter)}
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t shrink-0 flex gap-2">
          <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={handlePrint}>
            <Printer className="h-4 w-4" /> พิมพ์ใบเสร็จ
          </Button>
          <Button size="sm" className="flex-1" onClick={onClose}>
            ปิด
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────

function DebtPaymentModal({
  repair,
  onClose,
  onSuccess,
}: {
  repair: OutstandingRepair
  onClose: () => void
  onSuccess: (result: PaymentResult) => void
}) {
  const outstanding   = repair.outstandingAmount
  const half          = Math.round(outstanding / 2 * 100) / 100

  const [amount,        setAmount]        = useState(outstanding.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [note,          setNote]          = useState('')

  const mutation = useMutation({
    mutationFn: (body: { repairId: string; amount: number; paymentMethod: string; note?: string }) =>
      api.post('/debt-payments', body).then((r) => r.data as PaymentResult),
    onSuccess: (result) => onSuccess(result),
  })

  const numAmount  = parseFloat(amount) || 0
  const isFullPay  = Math.round(numAmount * 100) >= Math.round(outstanding * 100)
  const isValid    = numAmount > 0 && Math.round(numAmount * 100) <= Math.round(outstanding * 100)
  const deposit    = Number(repair.deposit)
  const finalCost  = Number(repair.finalCost ?? 0)
  const prevPaid   = repair.additionalPayments.reduce((s, p) => s + Number(p.amount), 0)

  const QUICK_AMOUNTS = [
    { label: 'ครบ',    value: outstanding,         color: 'bg-green-600 text-white border-green-600' },
    { label: 'ครึ่ง',  value: half,                color: 'bg-amber-500 text-white border-amber-500' },
  ]

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    mutation.mutate({
      repairId:      repair.id,
      amount:        numAmount,
      paymentMethod,
      note:          note.trim() || undefined,
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-0 sm:p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b shrink-0">
          <div>
            <p className="font-bold text-slate-800 text-base">รับชำระหนี้</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {repair.ticketNumber} · {repair.deviceBrand} {repair.deviceModel}
            </p>
          </div>
          <button onClick={onClose} className="mt-0.5 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Cost breakdown */}
          <div className="bg-slate-50 rounded-xl p-3.5 text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-slate-500">ค่าซ่อมทั้งหมด</span>
              <span className="font-medium">{money(finalCost)}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">มัดจำแล้ว</span>
                <span className="text-green-600 font-medium">−{money(deposit)}</span>
              </div>
            )}
            {prevPaid > 0 && (
              <div className="flex justify-between">
                <span className="text-slate-500">ชำระมาแล้ว</span>
                <span className="text-green-600 font-medium">−{money(prevPaid)}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-2 flex justify-between font-semibold text-sm">
              <span>ยังคงเหลือ</span>
              <span className="text-red-600 text-base">{money(outstanding)}</span>
            </div>
          </div>

          {/* Quick amount buttons */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-600">เลือกจำนวน</label>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => setAmount(q.value.toFixed(2))}
                  className={`h-14 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95 ${
                    parseFloat(amount) === q.value
                      ? q.color
                      : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                  }`}
                >
                  <span className="block text-xs font-normal opacity-70">{q.label}</span>
                  <span className="block tabular-nums">{money(q.value)}</span>
                </button>
              ))}
              {/* Custom amount input as 3rd tile */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs select-none">฿</span>
                <input
                  type="number"
                  min="0.01"
                  max={outstanding}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="กำหนดเอง"
                  inputMode="decimal"
                  className="h-14 w-full pl-6 pr-2 border-2 border-slate-200 rounded-2xl text-sm font-bold text-right bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            {numAmount > 0 && !isFullPay && isValid && (
              <p className="text-xs text-amber-600">
                ชำระบางส่วน — คงเหลือหลังชำระ {money(outstanding - numAmount)}
              </p>
            )}
            {numAmount > 0 && isFullPay && (
              <p className="text-xs text-green-600 font-semibold">✓ ชำระครบทั้งหมด</p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-2">วิธีชำระ</label>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_METHODS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex flex-col items-center gap-1.5 h-16 rounded-xl border-2 text-sm font-medium transition-all active:scale-95 ${
                    paymentMethod === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                  }`}
                >
                  <span className="text-xl leading-none">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">หมายเหตุ</label>
            <Input
              placeholder="(ถ้ามี)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Error */}
          {mutation.isError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
              {(mutation.error as any)?.response?.data?.message ?? 'เกิดข้อผิดพลาด กรุณาลองใหม่'}
            </div>
          )}
        </div>

        {/* Footer — large action button */}
        <div className="px-4 py-4 border-t shrink-0 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-14 px-5 rounded-2xl border-2 border-slate-200 text-slate-600 font-semibold active:bg-slate-50 transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isValid || mutation.isPending}
            className="flex-1 h-14 rounded-2xl bg-green-600 text-white font-bold text-base active:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
          >
            {mutation.isPending ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <CreditCard className="h-5 w-5" />
                รับชำระ {isValid && numAmount > 0 ? money(numAmount) : ''}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Payment Timeline ──────────────────────────────────────────────────────────

function PaymentTimeline({ payments }: { payments: AdditionalPayment[] }) {
  if (payments.length === 0) {
    return <p className="text-xs text-slate-400 italic py-1.5">ยังไม่มีประวัติการชำระ</p>
  }
  return (
    <div className="mt-2.5 space-y-0">
      {payments.map((p, i) => (
        <div key={p.id} className="flex items-start gap-3">
          <div className="flex flex-col items-center mt-1 shrink-0">
            <div className="h-3.5 w-3.5 rounded-full bg-green-100 border-2 border-green-400 flex-shrink-0" />
            {i < payments.length - 1 && (
              <div className="w-px flex-1 min-h-[16px] bg-slate-200" />
            )}
          </div>
          <div className="pb-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-green-700">{money(p.amount)}</span>
              <span className="text-xs text-slate-400">{PAYMENT_LABEL[p.paymentMethod] ?? p.paymentMethod}</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {format(new Date(p.createdAt), 'dd MMM yyyy HH:mm', { locale: th })}
              {p.createdBy?.name && (
                <span className="text-slate-500"> · {p.createdBy.name}</span>
              )}
            </p>
            {p.note && (
              <p className="text-xs text-slate-500 italic mt-0.5">{p.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Repair Card ───────────────────────────────────────────────────────────────

function RepairCard({
  repair,
  onPay,
}: {
  repair: OutstandingRepair
  onPay: (r: OutstandingRepair) => void
}) {
  const [showHistory, setShowHistory] = useState(false)

  const deposit      = Number(repair.deposit)
  const finalCost    = Number(repair.finalCost ?? 0)
  const prevPaid     = repair.additionalPayments.reduce((s, p) => s + Number(p.amount), 0)
  const isPartial    = repair.paymentStatus === 'PARTIAL'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3.5 space-y-3 hover:border-slate-300 transition-colors">
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-mono text-xs text-slate-400">{repair.ticketNumber}</span>
            {isPartial ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                ชำระบางส่วน
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                ยังไม่ชำระ
              </span>
            )}
          </div>
          <p className="font-semibold text-slate-800">
            {repair.deviceBrand} {repair.deviceModel}
            {repair.deviceColor && (
              <span className="font-normal text-slate-400 text-xs ml-1">({repair.deviceColor})</span>
            )}
          </p>
          {repair.deliveredAt && (
            <p className="text-xs text-slate-400 mt-0.5">
              ส่งมอบ {format(new Date(repair.deliveredAt), 'dd MMM yyyy', { locale: th })}
            </p>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0 bg-green-600 hover:bg-green-700 text-white"
          onClick={() => onPay(repair)}
        >
          รับชำระ
        </Button>
      </div>

      {/* Cost grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-xs">
        <div className="bg-white rounded-lg px-2.5 py-2 border border-slate-200">
          <p className="text-slate-400 mb-0.5">ค่าซ่อม</p>
          <p className="font-semibold text-slate-700 tabular-nums">{money(finalCost)}</p>
        </div>
        {deposit > 0 && (
          <div className="bg-white rounded-lg px-2.5 py-2 border border-slate-200">
            <p className="text-slate-400 mb-0.5">มัดจำ</p>
            <p className="font-semibold text-green-600 tabular-nums">{money(deposit)}</p>
          </div>
        )}
        {prevPaid > 0 && (
          <div className="bg-white rounded-lg px-2.5 py-2 border border-slate-200">
            <p className="text-slate-400 mb-0.5">ชำระแล้ว</p>
            <p className="font-semibold text-green-600 tabular-nums">{money(prevPaid)}</p>
          </div>
        )}
        <div className="bg-red-50 rounded-lg px-2.5 py-2 border border-red-200">
          <p className="text-red-400 mb-0.5">คงเหลือ</p>
          <p className="font-bold text-red-600 tabular-nums">{money(repair.outstandingAmount)}</p>
        </div>
      </div>

      {/* History toggle */}
      <button
        onClick={() => setShowHistory((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
      >
        {showHistory ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        <History className="h-3 w-3" />
        ประวัติการชำระ
        {repair.additionalPayments.length > 0 && (
          <span className="bg-slate-200 text-slate-600 rounded-full px-1.5 py-0 leading-4 font-medium">
            {repair.additionalPayments.length}
          </span>
        )}
      </button>

      {showHistory && (
        <div className="border-t border-slate-200 pt-2.5">
          <PaymentTimeline payments={repair.additionalPayments} />
        </div>
      )}
    </div>
  )
}

// ── Customer Section ──────────────────────────────────────────────────────────

function CustomerSection({
  group,
  defaultOpen,
  onPay,
}: {
  group: CustomerGroup
  defaultOpen: boolean
  onPay: (r: OutstandingRepair) => void
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-9 w-9 shrink-0 rounded-full bg-red-50 border border-red-100 flex items-center justify-center">
            <AlertCircle className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-left min-w-0">
            <p className="font-semibold text-slate-800 truncate">{group.name}</p>
            <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
              {group.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {group.phone}
                </span>
              )}
              <span>{group.repairs.length} งานซ่อม</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2.5 shrink-0 ml-2">
          <p className="text-base font-bold text-red-600 tabular-nums">{money(group.totalDebt)}</p>
          {open
            ? <ChevronUp  className="h-4 w-4 text-slate-400" />
            : <ChevronDown className="h-4 w-4 text-slate-400" />
          }
        </div>
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-2.5 border-t border-slate-100">
          {group.repairs.map((repair) => (
            <RepairCard key={repair.id} repair={repair} onPay={onPay} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function DebtPage() {
  const queryClient  = useQueryClient()
  const [paying,     setPaying]     = useState<OutstandingRepair | null>(null)
  const [receipt,    setReceipt]    = useState<PaymentResult | null>(null)
  const { branchId } = useBranchContext()

  const { data: repairs = [], isLoading } = useQuery<OutstandingRepair[]>({
    queryKey: ['repairs-outstanding', branchId],
    queryFn:  async () => {
      const params = new URLSearchParams()
      if (branchId) params.set('branchId', branchId)
      return (await api.get(`/repairs/outstanding?${params}`)).data
    },
    staleTime: 30_000,
  })

  const groups    = groupRepairs(repairs)
  const totalDebt = groups.reduce((s, g) => s + g.totalDebt, 0)
  const unpaidCount   = repairs.filter((r) => r.paymentStatus === 'PENDING').length
  const partialCount  = repairs.filter((r) => r.paymentStatus === 'PARTIAL').length

  function handlePaySuccess(result: PaymentResult) {
    setPaying(null)
    setReceipt(result)
    queryClient.invalidateQueries({ queryKey: ['repairs-outstanding'] })
    queryClient.invalidateQueries({ queryKey: ['debt-summary'] })
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">หนี้ค้างชำระ</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            งานซ่อมที่ส่งมอบแล้วแต่ยังไม่ได้รับเงิน
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <BranchContextBar className="hidden sm:flex" />
          {repairs.length > 0 && (
            <div className="text-right">
              <p className="text-xs text-muted-foreground">รวมยอดค้าง</p>
              <p className="text-xl font-bold text-red-600 tabular-nums">{money(totalDebt)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Summary chips */}
      {!isLoading && repairs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs bg-white border border-slate-200 rounded-full px-3 py-1.5">
            <Users className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-slate-600">{groups.length} ลูกค้า</span>
          </div>
          {unpaidCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-red-50 border border-red-200 rounded-full px-3 py-1.5">
              <Clock className="h-3.5 w-3.5 text-red-400" />
              <span className="text-red-600">{unpaidCount} ยังไม่ชำระ</span>
            </div>
          )}
          {partialCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs bg-amber-50 border border-amber-200 rounded-full px-3 py-1.5">
              <CreditCard className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-amber-700">{partialCount} ชำระบางส่วน</span>
            </div>
          )}
        </div>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 bg-white rounded-xl border animate-pulse" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 bg-white rounded-xl border border-slate-200">
          <CheckCircle2 className="h-12 w-12 text-green-200" />
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">ไม่มีหนี้ค้างชำระ</p>
            <p className="text-xs text-slate-400 mt-0.5">ลูกค้าทุกคนชำระเงินครบแล้ว</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((group, i) => (
            <CustomerSection
              key={group.customerId}
              group={group}
              defaultOpen={i === 0}
              onPay={setPaying}
            />
          ))}
        </div>
      )}

      {/* Payment Modal */}
      {paying && (
        <DebtPaymentModal
          repair={paying}
          onClose={() => setPaying(null)}
          onSuccess={handlePaySuccess}
        />
      )}

      {/* Receipt Modal */}
      {receipt && (
        <ReceiptModal
          result={receipt}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  )
}
