'use client'

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import {
  ChevronLeft, Phone, Printer, Loader2,
  Package, DollarSign, CheckCircle2, Clock,
  User, Wrench, AlertTriangle, Shield,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import api from '@/lib/api'
import { printRepairReceipt } from '@/lib/print'

// ── Status config (matches backend exactly) ───────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RECEIVED:         'รับงานใหม่',
  DIAGNOSING:       'ตรวจวินิจฉัย',
  WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  QC_PENDING:       'รอ QC',
  COMPLETED:        'ซ่อมเสร็จ',
  READY_PICKUP:     'รอรับเครื่อง',
  DELIVERED:        'ส่งมอบแล้ว',
  CANCELLED:        'ยกเลิก',
}

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  QC_PENDING:       'bg-indigo-100 text-indigo-700',
  COMPLETED:        'bg-green-100 text-green-700',
  READY_PICKUP:     'bg-emerald-100 text-emerald-700',
  DELIVERED:        'bg-slate-100 text-slate-600 dark:text-slate-400',
  CANCELLED:        'bg-red-100 text-red-600',
}

const STATUS_FLOW = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED',
  'WAITING_PARTS', 'IN_PROGRESS', 'QC_PENDING', 'COMPLETED',
  'READY_PICKUP', 'DELIVERED',
]

const CHANGEABLE_STATUSES = [
  'RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'WAITING_PARTS',
  'IN_PROGRESS', 'COMPLETED', 'READY_PICKUP', 'CANCELLED',
]

// ── Types ──────────────────────────────────────────────────────────────────────

interface RepairPart {
  id:              string
  productName?:    string
  product:         { name: string }
  quantity:        number
  costPrice?:      number
  sellPrice?:      number
  price?:          number
  chargeToCustomer: boolean
}

interface Repair {
  id:                   string
  ticketNumber:         string
  status:               string
  paymentStatus?:       string
  customer?:            { name: string; phone?: string } | null
  deviceBrand:          string
  deviceModel:          string
  deviceColor?:         string
  deviceImei?:          string
  accessories?:         string
  issue:                string
  note?:                string
  technician?:          { name: string } | null
  estimateCost?:        number
  estimatedTotal?:      number
  estimatedLaborCost?:  number
  estimatedPartsCost?:  number
  finalCost?:           number
  deposit?:             number
  paidAmount?:          number
  paidAt?:              string
  paymentMethod?:       string
  receivedAt:           string
  completedAt?:         string
  deliveredAt?:         string
  warrantyExpiresAt?:   string
  warrantyNote?:        string
  parts:                RepairPart[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(n?: number | null) {
  if (n == null || n === 0) return null
  return Number(n).toLocaleString('th-TH') + ' ฿'
}

function fmtDate(s?: string | null) {
  if (!s) return null
  try { return format(new Date(s), 'd MMM yyyy HH:mm', { locale: th }) }
  catch { return s }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function RepairDetailPage() {
  const router      = useRouter()
  const { id }      = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const [selectedStatus, setSelectedStatus] = useState('')

  const { data: repair, isLoading } = useQuery<Repair>({
    queryKey: ['staff-repair', id],
    queryFn:  async () => (await api.get(`/repairs/${id}`)).data,
    enabled:  !!id,
  })

  useEffect(() => {
    if (repair) setSelectedStatus(repair.status)
  }, [repair])

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/repairs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staff-repair', id] })
      queryClient.invalidateQueries({ queryKey: ['staff-repairs'] })
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message ?? 'เกิดข้อผิดพลาด')
    },
  })

  function handleStatusChange() {
    if (!selectedStatus || selectedStatus === repair?.status) return
    updateMutation.mutate(
      { status: selectedStatus },
      { onSuccess: () => toast.success(`เปลี่ยนสถานะเป็น "${STATUS_LABEL[selectedStatus]}" แล้ว`) },
    )
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (isLoading) return (
    <div className="flex min-h-screen items-center justify-center bg-[#F8F9FB]">
      <Loader2 className="h-8 w-8 animate-spin text-[#FFC107]" />
    </div>
  )
  if (!repair) return null

  // ── Computed values ───────────────────────────────────────────────────────────

  const curIdx  = STATUS_FLOW.indexOf(repair.status)
  const total   = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
  const deposit = Number(repair.deposit ?? 0)
  const balance = Math.max(0, total - deposit)
  const partsCOGS = repair.parts.reduce(
    (s, p) => s + Number(p.costPrice ?? p.price ?? 0) * p.quantity, 0,
  )

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-32">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]"
          >
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400">รายละเอียดงานซ่อม</p>
            <p className="font-bold text-[#111] font-mono">{repair.ticketNumber}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold shrink-0 ${STATUS_COLOR[repair.status] ?? 'bg-slate-100 text-slate-500'}`}>
            {STATUS_LABEL[repair.status] ?? repair.status}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-5">

        {/* ── Customer + Device ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/10">
                <User className="h-5 w-5 text-[#FFC107]" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-[#111] truncate">
                  {repair.customer?.name ?? 'ไม่ระบุลูกค้า'}
                </p>
                {repair.customer?.phone && (
                  <p className="text-sm text-slate-500">{repair.customer.phone}</p>
                )}
              </div>
            </div>
            {repair.customer?.phone && (
              <a
                href={`tel:${repair.customer.phone}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#F8F9FB]"
              >
                <Phone className="h-4 w-4 text-emerald-500" />
              </a>
            )}
          </div>

          <div className="flex items-center gap-3 rounded-xl bg-[#F8F9FB] p-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/10">
              <span className="text-xl">📱</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#111] truncate">
                {repair.deviceBrand} {repair.deviceModel}
                {repair.deviceColor ? ` (${repair.deviceColor})` : ''}
              </p>
              {repair.deviceImei && (
                <p className="text-xs text-slate-400 font-mono mt-0.5">IMEI: {repair.deviceImei}</p>
              )}
              <p className="text-xs text-slate-500 mt-0.5 truncate">อาการ: {repair.issue}</p>
            </div>
          </div>

          {repair.accessories && (
            <p className="mt-2 text-xs text-slate-500 px-1">อุปกรณ์ที่ฝาก: {repair.accessories}</p>
          )}
          {repair.technician && (
            <div className="mt-3 flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-xs text-slate-400">ช่าง:</span>
              <span className="text-xs font-semibold text-[#111]">{repair.technician.name}</span>
            </div>
          )}
          {repair.note && (
            <div className="mt-2 rounded-xl bg-amber-50 px-3 py-2">
              <p className="text-xs text-amber-700">หมายเหตุ: {repair.note}</p>
            </div>
          )}
        </div>

        {/* ── Progress timeline ─────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <p className="mb-4 text-sm font-bold text-[#111]">ความคืบหน้า</p>

          {repair.status === 'CANCELLED' ? (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2.5">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <span className="text-sm font-semibold text-red-600">งานซ่อมถูกยกเลิก</span>
            </div>
          ) : (
            <div className="flex flex-col gap-0">
              {STATUS_FLOW.map((s, i) => {
                const done    = i < curIdx
                const current = i === curIdx
                const isLast  = i === STATUS_FLOW.length - 1
                return (
                  <div key={s} className="flex gap-3.5">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        current ? 'bg-[#FFC107] text-[#111] shadow-[0_4px_12px_rgba(255,193,7,0.4)]' :
                        done    ? 'bg-[#22C55E] text-white' :
                                  'bg-slate-100 text-slate-300'
                      }`}>
                        {done ? '✓' : i + 1}
                      </div>
                      {!isLast && (
                        <div className={`my-1 w-0.5 h-6 ${done ? 'bg-[#22C55E]' : 'bg-slate-100'}`} />
                      )}
                    </div>
                    <div className={`pt-1.5 ${isLast ? '' : 'pb-2'}`}>
                      <p className={`text-sm font-semibold ${
                        current ? 'text-[#111]' : done ? 'text-[#22C55E]' : 'text-slate-300'
                      }`}>
                        {STATUS_LABEL[s]}
                      </p>
                      {current && (
                        <p className="text-[11px] text-slate-400">{fmtDate(repair.receivedAt)}</p>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Parts ────────────────────────────────────────────────────────── */}
        {repair.parts.length > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-3">
              <Package className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-bold text-[#111]">อะไหล่ที่ใช้ ({repair.parts.length} รายการ)</p>
            </div>
            <div className="space-y-2">
              {repair.parts.map((part) => {
                const name = part.productName ?? part.product.name
                const cost = Number(part.costPrice ?? part.price ?? 0)
                const sell = Number(part.sellPrice ?? 0)
                return (
                  <div key={part.id} className="flex items-center gap-3 rounded-xl bg-[#F8F9FB] px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#111] truncate">{name}</p>
                      <p className="text-xs text-slate-400">
                        ×{part.quantity}
                        {part.chargeToCustomer && sell > 0 && (
                          <span className="ml-1 text-blue-500">· คิดลูกค้า {fmtMoney(sell)}/ชิ้น</span>
                        )}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-[#111] tabular-nums shrink-0">
                      {fmtMoney(cost * part.quantity)}
                    </p>
                  </div>
                )
              })}
              {partsCOGS > 0 && (
                <div className="flex justify-between items-center pt-2 border-t border-[#F8F9FB]">
                  <span className="text-xs text-slate-400">ต้นทุนอะไหล่รวม</span>
                  <span className="text-sm font-bold text-orange-600">{fmtMoney(partsCOGS)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Cost summary ──────────────────────────────────────────────────── */}
        {total > 0 && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-3">
              <DollarSign className="h-4 w-4 text-slate-400" />
              <p className="text-sm font-bold text-[#111]">ค่าบริการ</p>
            </div>
            <div className="space-y-2 text-sm">
              {Number(repair.estimatedLaborCost) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">ค่าแรง</span>
                  <span className="font-semibold tabular-nums text-[#111]">
                    {fmtMoney(Number(repair.estimatedLaborCost))}
                  </span>
                </div>
              )}
              {Number(repair.estimatedPartsCost) > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-500">ค่าอะไหล่</span>
                  <span className="font-semibold tabular-nums text-[#111]">
                    {fmtMoney(Number(repair.estimatedPartsCost))}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t border-[#F8F9FB] pt-2 mt-1">
                <span className="text-[#111]">รวมทั้งหมด</span>
                <span className="text-[#FFC107]">{fmtMoney(total)}</span>
              </div>
              {deposit > 0 && (
                <div className="flex justify-between text-emerald-600 text-xs">
                  <span>รับมัดจำแล้ว</span>
                  <span className="tabular-nums">- {fmtMoney(deposit)}</span>
                </div>
              )}
              {balance > 0 && (
                <div className="flex justify-between font-bold text-blue-600">
                  <span>ค้างชำระ</span>
                  <span className="tabular-nums">{fmtMoney(balance)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Payment status ────────────────────────────────────────────────── */}
        {repair.paymentStatus === 'PAID' && (
          <div className="rounded-2xl bg-emerald-50 p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-6 w-6 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-emerald-700">ชำระเงินแล้ว</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  {fmtMoney(Number(repair.paidAmount))}
                  {repair.paymentMethod === 'CASH'     ? ' · เงินสด'    :
                   repair.paymentMethod === 'TRANSFER' ? ' · โอนเงิน'   :
                   repair.paymentMethod === 'CARD'     ? ' · บัตรเครดิต' : ''}
                  {repair.paidAt ? ` · ${fmtDate(repair.paidAt)}` : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ── Warranty ──────────────────────────────────────────────────────── */}
        {repair.warrantyExpiresAt && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-emerald-100">
            <div className="flex items-center gap-3">
              <Shield className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-bold text-[#111]">การรับประกัน</p>
                <p className="text-xs text-emerald-600 mt-0.5">
                  หมดอายุ {fmtDate(repair.warrantyExpiresAt)}
                </p>
                {repair.warrantyNote && (
                  <p className="text-xs text-slate-400 mt-0.5">{repair.warrantyNote}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Change status ─────────────────────────────────────────────────── */}
        {repair.status !== 'DELIVERED' && repair.status !== 'CANCELLED' && (
          <div className="rounded-2xl bg-white p-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <p className="text-sm font-bold text-[#111] mb-3">เปลี่ยนสถานะ</p>
            <div className="flex gap-2">
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="flex-1 h-11 rounded-xl bg-[#F8F9FB] px-3 text-sm font-medium text-[#111] outline-none border-0"
              >
                {CHANGEABLE_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <button
                onClick={handleStatusChange}
                disabled={selectedStatus === repair.status || updateMutation.isPending}
                className="flex h-11 items-center justify-center px-4 rounded-xl bg-[#FFC107] text-sm font-bold text-[#111] disabled:opacity-40 shadow-[0_2px_8px_rgba(255,193,7,0.3)]"
              >
                {updateMutation.isPending
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : 'บันทึก'
                }
              </button>
            </div>
          </div>
        )}

        {/* timestamps */}
        <div className="flex items-center gap-2 px-1">
          <Clock className="h-3.5 w-3.5 text-slate-300" />
          <p className="text-xs text-slate-400">รับงาน {fmtDate(repair.receivedAt)}</p>
        </div>
        {repair.completedAt && (
          <p className="text-xs text-slate-400 px-1">ซ่อมเสร็จ {fmtDate(repair.completedAt)}</p>
        )}

      </div>

      {/* ── Bottom actions ────────────────────────────────────────────────────── */}
      <div className="fixed bottom-0 left-0 right-0 flex flex-col gap-2.5 bg-[#F8F9FB] px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <button
          onClick={() => printRepairReceipt(repair.id, { paperWidth: '80mm' })}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFC107] text-base font-bold text-[#111] shadow-[0_4px_20px_rgba(255,193,7,0.4)] active:scale-[0.98] transition-transform"
        >
          <Printer className="h-5 w-5" />
          พิมพ์ใบรับซ่อม
        </button>
        {repair.customer?.phone && (
          <a
            href={`tel:${repair.customer.phone}`}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white text-sm font-semibold text-[#111] active:bg-slate-50"
          >
            <Phone className="h-4 w-4 text-emerald-500" />
            โทรหาลูกค้า
          </a>
        )}
      </div>

    </div>
  )
}
