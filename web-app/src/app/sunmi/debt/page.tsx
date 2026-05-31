'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowLeft, CreditCard, ChevronDown, ChevronUp,
  Users, Phone, CheckCircle2, X, Printer,
} from 'lucide-react'
import { MobileBottomNav } from '@/components/sunmi/mobile-bottom-nav'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AdditionalPayment {
  id: string
  amount: string | number
  paymentMethod: string
  note: string | null
  createdAt: string
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
  payment: { id: string; amount: string | number; paymentMethod: string; note: string | null; createdAt: string; receiptNumber: string }
  repair: { id: string; ticketNumber: string; deviceBrand: string; deviceModel: string; finalCost: number; deposit: number; previousPaid: number; amountPaid: number; remainingAfter: number; paymentStatus: string; customer: { name: string; phone: string | null } | null }
  receiptNumber: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: 'CASH',     label: 'เงินสด',  icon: '💵' },
  { value: 'TRANSFER', label: 'โอนเงิน', icon: '📲' },
  { value: 'CARD',     label: 'บัตร',    icon: '💳' },
]

const PAYMENT_LABEL: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตรเครดิต',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function money(v: string | number | null | undefined) {
  return formatThaiMoney(Number(v ?? 0))
}

function groupRepairs(repairs: OutstandingRepair[]): CustomerGroup[] {
  const map = new Map<string, CustomerGroup>()
  for (const r of repairs) {
    const key   = r.customer?.id ?? '__unknown__'
    const name  = r.customer?.name ?? 'ไม่ระบุลูกค้า'
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

// ── Payment bottom-sheet ──────────────────────────────────────────────────────

function PaymentSheet({
  repair,
  onClose,
  onSuccess,
}: {
  repair: OutstandingRepair
  onClose: () => void
  onSuccess: (r: PaymentResult) => void
}) {
  const outstanding = repair.outstandingAmount
  const [amount, setAmount]               = useState(outstanding.toFixed(2))
  const [paymentMethod, setPaymentMethod] = useState('CASH')
  const [note, setNote]                   = useState('')

  const mutation = useMutation({
    mutationFn: (body: { repairId: string; amount: number; paymentMethod: string; note?: string }) =>
      api.post('/debt-payments', body).then((r) => r.data as PaymentResult),
    onSuccess: (result) => onSuccess(result),
  })

  const numAmount = parseFloat(amount) || 0
  const isFullPay = numAmount >= outstanding - 0.005
  const isValid   = numAmount > 0 && numAmount <= outstanding + 0.005
  const deposit   = Number(repair.deposit)
  const finalCost = Number(repair.finalCost ?? 0)
  const prevPaid  = repair.additionalPayments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-t-3xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet handle */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-3 border-b shrink-0">
          <div>
            <p className="font-bold text-slate-900 text-base">รับชำระหนี้</p>
            <p className="text-xs text-slate-400 mt-0.5">
              {repair.ticketNumber} · {repair.deviceBrand} {repair.deviceModel}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl active:bg-slate-100 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-5">
          {/* Breakdown */}
          <div className="bg-slate-50 rounded-2xl p-4 text-sm space-y-2">
            <div className="flex justify-between text-slate-500">
              <span>ค่าซ่อมทั้งหมด</span>
              <span className="font-medium text-slate-700">{money(finalCost)}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>มัดจำแล้ว</span>
                <span className="text-green-600 font-medium">−{money(deposit)}</span>
              </div>
            )}
            {prevPaid > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>ชำระมาแล้ว</span>
                <span className="text-green-600 font-medium">−{money(prevPaid)}</span>
              </div>
            )}
            <div className="border-t border-slate-200 pt-3 flex justify-between font-bold text-base">
              <span>ยังคงเหลือ</span>
              <span className="text-red-600">{money(outstanding)}</span>
            </div>
          </div>

          {/* Quick amount tiles */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3">เลือกจำนวน</p>
            <div className="grid grid-cols-3 gap-2.5">
              {/* ครบ */}
              <button
                type="button"
                onClick={() => setAmount(outstanding.toFixed(2))}
                className={[
                  'h-16 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95',
                  parseFloat(amount) === outstanding
                    ? 'border-green-500 bg-green-500 text-white'
                    : 'border-slate-200 bg-white text-slate-700',
                ].join(' ')}
              >
                <span className="block text-xs font-normal opacity-70">ครบ</span>
                <span className="block tabular-nums text-sm">{money(outstanding)}</span>
              </button>
              {/* ครึ่ง */}
              <button
                type="button"
                onClick={() => setAmount((Math.round(outstanding / 2 * 100) / 100).toFixed(2))}
                className={[
                  'h-16 rounded-2xl border-2 font-bold text-sm transition-all active:scale-95',
                  parseFloat(amount) === Math.round(outstanding / 2 * 100) / 100
                    ? 'border-amber-500 bg-amber-500 text-white'
                    : 'border-slate-200 bg-white text-slate-700',
                ].join(' ')}
              >
                <span className="block text-xs font-normal opacity-70">ครึ่ง</span>
                <span className="block tabular-nums text-sm">{money(Math.round(outstanding / 2 * 100) / 100)}</span>
              </button>
              {/* Custom */}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm select-none pointer-events-none">฿</span>
                <input
                  type="number"
                  min="0.01"
                  max={outstanding}
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="กำหนดเอง"
                  inputMode="decimal"
                  className="h-16 w-full pl-7 pr-2 border-2 border-slate-200 rounded-2xl text-sm font-bold text-right bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
            {numAmount > 0 && !isFullPay && isValid && (
              <p className="text-xs text-amber-600 mt-2">ชำระบางส่วน — คงเหลือหลังชำระ {money(outstanding - numAmount)}</p>
            )}
            {numAmount > 0 && isFullPay && (
              <p className="text-xs text-green-600 font-semibold mt-2">✓ ชำระครบทั้งหมด</p>
            )}
          </div>

          {/* Payment method */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-3">วิธีชำระ</p>
            <div className="grid grid-cols-3 gap-2.5">
              {PAYMENT_METHODS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={[
                    'flex flex-col items-center gap-1.5 h-16 rounded-2xl border-2 text-sm font-semibold transition-all active:scale-95',
                    paymentMethod === opt.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600',
                  ].join(' ')}
                >
                  <span className="text-2xl leading-none">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-sm font-bold text-slate-700 mb-2">หมายเหตุ (ไม่บังคับ)</p>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="เช่น มัดจำเพิ่ม, ส่วนลดพิเศษ"
              className="w-full h-12 px-4 border-2 border-slate-200 rounded-2xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Confirm */}
        <div className="px-5 py-4 border-t shrink-0">
          <button
            onClick={() => {
              if (!isValid) return
              mutation.mutate({ repairId: repair.id, amount: numAmount, paymentMethod, note: note.trim() || undefined })
            }}
            disabled={!isValid || mutation.isPending}
            className={[
              'w-full h-14 rounded-2xl font-bold text-base transition-all active:scale-[0.98]',
              isValid
                ? 'bg-green-600 text-white active:bg-green-700'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed',
            ].join(' ')}
          >
            {mutation.isPending ? 'กำลังบันทึก...' : `ยืนยันรับชำระ ${numAmount > 0 ? money(numAmount) : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Success sheet ─────────────────────────────────────────────────────────────

function SuccessSheet({ result, onClose }: { result: PaymentResult; onClose: () => void }) {
  const isPaid  = result.repair.paymentStatus === 'PAID'
  const dateStr = format(new Date(result.payment.createdAt), 'dd MMM yyyy HH:mm', { locale: th })

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="h-1.5 w-10 rounded-full bg-slate-200" />
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-b shrink-0">
          <CheckCircle2 className="h-6 w-6 text-green-500" />
          <p className="font-bold text-slate-900 text-base">รับชำระสำเร็จ</p>
        </div>

        <div className="overflow-y-auto flex-1 px-5 py-4 font-mono text-sm space-y-1.5 text-slate-800">
          <div className="text-center font-bold text-base mb-2">FixITPro</div>
          <div className="text-center text-xs text-slate-400 mb-3">ใบเสร็จรับเงิน (หนี้ค้างชำระ)</div>
          <hr className="border-dashed border-slate-300 my-2" />
          <Row label="เลขที่" value={result.receiptNumber} />
          <Row label="วันที่" value={dateStr} />
          <hr className="border-dashed border-slate-300 my-2" />
          <Row label="ลูกค้า" value={result.repair.customer?.name ?? '—'} />
          {result.repair.customer?.phone && <Row label="เบอร์" value={result.repair.customer.phone} />}
          <hr className="border-dashed border-slate-300 my-2" />
          <Row label="ใบงาน" value={result.repair.ticketNumber} />
          <Row label="อุปกรณ์" value={`${result.repair.deviceBrand} ${result.repair.deviceModel}`} />
          <Row label="ค่าซ่อมรวม" value={money(result.repair.finalCost)} />
          <hr className="border-dashed border-slate-300 my-2" />
          <div className="flex justify-between font-bold text-base">
            <span>รับชำระ</span>
            <span className="text-green-600">{money(result.repair.amountPaid)}</span>
          </div>
          <Row label="วิธีชำระ" value={PAYMENT_LABEL[result.payment.paymentMethod] ?? result.payment.paymentMethod} />
          {result.payment.note && <Row label="หมายเหตุ" value={result.payment.note} />}
          <hr className="border-dashed border-slate-300 my-2" />
          <div className="flex justify-between font-bold">
            <span>ยอดคงเหลือ</span>
            <span className={isPaid ? 'text-green-600' : 'text-red-600'}>
              {isPaid ? '✓ ชำระครบแล้ว' : money(result.repair.remainingAfter)}
            </span>
          </div>
        </div>

        <div className="px-5 py-4 border-t shrink-0">
          <button
            onClick={onClose}
            className="w-full h-14 bg-slate-900 text-white rounded-2xl font-bold text-base active:bg-slate-800 transition-colors"
          >
            ปิด
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-slate-400">{label}:</span>
      <span className="font-medium text-right ml-2">{value}</span>
    </div>
  )
}

// ── Repair row ────────────────────────────────────────────────────────────────

function RepairRow({
  repair,
  onPay,
}: {
  repair: OutstandingRepair
  onPay: () => void
}) {
  const prevPaid = repair.additionalPayments.reduce((s, p) => s + Number(p.amount), 0)

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-slate-900 text-sm">{repair.deviceBrand} {repair.deviceModel}</p>
          <p className="text-xs text-slate-400 mt-0.5">{repair.ticketNumber}</p>
          {repair.deliveredAt && (
            <p className="text-xs text-slate-400 mt-0.5">
              ส่งคืน: {format(new Date(repair.deliveredAt), 'dd MMM yy', { locale: th })}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-red-600 text-base tabular-nums">{money(repair.outstandingAmount)}</p>
          <p className="text-[10px] text-slate-400 mt-0.5">ค้างชำระ</p>
        </div>
      </div>

      {/* Cost summary */}
      <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1.5">
        <div className="flex justify-between text-slate-500">
          <span>ค่าซ่อมทั้งหมด</span>
          <span>{money(repair.finalCost)}</span>
        </div>
        {Number(repair.deposit) > 0 && (
          <div className="flex justify-between text-slate-500">
            <span>มัดจำ</span>
            <span className="text-green-600">−{money(repair.deposit)}</span>
          </div>
        )}
        {prevPaid > 0 && (
          <div className="flex justify-between text-slate-500">
            <span>ชำระมาแล้ว</span>
            <span className="text-green-600">−{money(prevPaid)}</span>
          </div>
        )}
      </div>

      <button
        onClick={onPay}
        className="w-full h-12 bg-green-600 text-white rounded-2xl font-bold text-sm active:bg-green-700 transition-colors"
      >
        รับชำระ {money(repair.outstandingAmount)}
      </button>
    </div>
  )
}

// ── Customer card ─────────────────────────────────────────────────────────────

function CustomerCard({
  group,
  onPay,
}: {
  group: CustomerGroup
  onPay: (repair: OutstandingRepair) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200 bg-white">
      {/* Header row — tap to expand */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-slate-50 transition-colors"
      >
        <div className="h-11 w-11 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
          <span className="text-white font-bold text-base">{group.name[0]?.toUpperCase() ?? '?'}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-900 text-base truncate">{group.name}</p>
          {group.phone && (
            <p className="flex items-center gap-1 text-xs text-slate-400 mt-0.5">
              <Phone className="h-3 w-3" />
              {group.phone}
            </p>
          )}
          <p className="text-xs text-slate-400 mt-0.5">{group.repairs.length} ใบงาน</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-red-600 text-lg tabular-nums">{money(group.totalDebt)}</p>
          {expanded
            ? <ChevronUp className="h-4 w-4 text-slate-400 ml-auto mt-1" />
            : <ChevronDown className="h-4 w-4 text-slate-400 ml-auto mt-1" />
          }
        </div>
      </button>

      {/* Repair list */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-100 pt-3">
          {group.repairs.map((r) => (
            <RepairRow key={r.id} repair={r} onPay={() => onPay(r)} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SunmiDebtPage() {
  const router = useRouter()
  const qc     = useQueryClient()

  const [selectedRepair, setSelectedRepair] = useState<OutstandingRepair | null>(null)
  const [successResult,  setSuccessResult]  = useState<PaymentResult | null>(null)
  const [search, setSearch]                 = useState('')

  const { data: repairs = [], isLoading } = useQuery<OutstandingRepair[]>({
    queryKey: ['repairs', 'outstanding'],
    queryFn:  async () => (await api.get('/repairs/outstanding')).data,
    staleTime: 30_000,
  })

  const groups = groupRepairs(repairs).filter((g) =>
    !search || g.name.toLowerCase().includes(search.toLowerCase()) || (g.phone ?? '').includes(search),
  )

  const totalDebt = groups.reduce((s, g) => s + g.totalDebt, 0)

  function handlePaySuccess(result: PaymentResult) {
    setSelectedRepair(null)
    setSuccessResult(result)
    qc.invalidateQueries({ queryKey: ['repairs', 'outstanding'] })
  }

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 select-none">
      {/* Header */}
      <div className="shrink-0 px-4 pt-10 pb-5">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-300" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase">FixITPro</p>
            <h1 className="text-white text-xl font-bold">ลูกหนี้</h1>
          </div>
          {totalDebt > 0 && (
            <div className="text-right shrink-0">
              <p className="text-xs text-slate-400">ยอดรวม</p>
              <p className="text-red-400 font-bold text-base tabular-nums">{money(totalDebt)}</p>
            </div>
          )}
        </div>

        {/* Search */}
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ค้นหาชื่อลูกค้า / เบอร์โทร"
          className="w-full h-12 px-4 rounded-2xl bg-slate-800 text-white placeholder-slate-500 text-sm border border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Content */}
      <div className="flex-1 bg-slate-100 rounded-t-3xl overflow-y-auto">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Users className="h-14 w-14 mb-4 opacity-20" />
            <p className="text-base font-semibold">
              {search ? 'ไม่พบลูกค้าที่ค้นหา' : 'ไม่มีหนี้ค้างชำระ'}
            </p>
            {!search && <p className="text-sm mt-1">งานซ่อมทั้งหมดชำระครบแล้ว</p>}
          </div>
        ) : (
          <div className="px-3 pt-4 pb-4 space-y-3">
            {/* Summary badge */}
            <div className="flex items-center gap-2 px-1 mb-1">
              <CreditCard className="h-4 w-4 text-slate-500" />
              <p className="text-sm text-slate-600 font-medium">
                {groups.length} ราย · {repairs.filter((r) => r.outstandingAmount > 0).length} ใบงาน
              </p>
            </div>
            {groups.map((g) => (
              <CustomerCard key={g.customerId} group={g} onPay={setSelectedRepair} />
            ))}
          </div>
        )}
      </div>

      <MobileBottomNav />

      {/* Payment sheet */}
      {selectedRepair && (
        <PaymentSheet
          repair={selectedRepair}
          onClose={() => setSelectedRepair(null)}
          onSuccess={handlePaySuccess}
        />
      )}

      {/* Success sheet */}
      {successResult && (
        <SuccessSheet
          result={successResult}
          onClose={() => setSuccessResult(null)}
        />
      )}
    </div>
  )
}
