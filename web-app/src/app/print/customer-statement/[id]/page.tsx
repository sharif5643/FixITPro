'use client'

import { use, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { Customer, ShopSettings } from '@/types'

// ── Extended types ─────────────────────────────────────────────────────────────

interface RepairRow {
  id:            string
  ticketNumber:  string
  deviceBrand:   string
  deviceModel:   string
  status:        string
  receivedAt:    string
  finalCost:     number | null
  paidAmount:    number | null
  paymentStatus: string
}

interface SaleRow {
  id:            string
  receiptNumber: string
  total:         number
  status:        string
  paymentMethod: string | null
  createdAt:     string
}

interface CustomerDetail extends Customer {
  repairs:       RepairRow[]
  sales:         SaleRow[]
  totalSpending: number
  unpaidBalance: number
  lastVisitAt?:  string | null
}

// ── Labels ────────────────────────────────────────────────────────────────────

const REPAIR_STATUS: Record<string, string> = {
  PENDING:    'รอดำเนินการ',
  DIAGNOSING: 'วินิจฉัย',
  WAITING_PARTS: 'รอชิ้นส่วน',
  IN_PROGRESS: 'กำลังซ่อม',
  WAITING_APPROVAL: 'รออนุมัติ',
  QC:         'ตรวจ QC',
  READY:      'พร้อมรับ',
  DELIVERED:  'ส่งมอบแล้ว',
  CANCELLED:  'ยกเลิก',
}

const PAY_STATUS: Record<string, string> = {
  PENDING:  'ค้างชำระ',
  PARTIAL:  'ชำระบางส่วน',
  PAID:     'ชำระแล้ว',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yyyy') }
  catch { return d }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CustomerStatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }         = use(params)
  const autoPrintFired = useRef(false)

  const { data: customer, isLoading, isError } = useQuery<CustomerDetail>({
    queryKey: ['customer-print', id],
    queryFn:  () => api.get(`/customers/${id}`).then(r => r.data),
    staleTime: 300_000,
    retry: 1,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  () => api.get('/settings').then(r => r.data),
    staleTime: 60_000,
  })

  // Inject @page CSS
  useEffect(() => {
    const style = document.createElement('style')
    style.id    = 'print-page-size'
    style.textContent = `
      @page { size: A4 portrait; margin: 14mm 14mm 14mm 14mm; }
      @media print {
        html, body { background: #fff !important; }
        .no-print  { display: none !important; }
      }
    `
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [])

  // Auto-print
  useEffect(() => {
    if (!customer || autoPrintFired.current) return
    autoPrintFired.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [customer])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }
  if (isError || !customer) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        ไม่พบข้อมูลลูกค้า
      </div>
    )
  }

  const shopName    = settings?.shopName    ?? 'FixITPro'
  const shopAddress = settings?.shopAddress ?? ''
  const shopPhone   = settings?.shopPhone   ?? ''

  const repairs = customer.repairs ?? []
  const sales   = customer.sales   ?? []

  const unpaid     = Number(customer.unpaidBalance ?? 0)
  const totalSales = Number(customer.totalSpending ?? 0)

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ── Action bar (no-print) ─────────────────────────────────────── */}
      <div className="no-print fixed top-0 inset-x-0 bg-slate-800 text-white flex items-center justify-between px-6 py-3 z-50 shadow">
        <span className="text-sm font-medium">Statement — {customer.name}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-white text-slate-900 text-sm font-semibold px-4 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <Printer className="h-4 w-4" />
            พิมพ์
          </button>
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors"
          >
            <X className="h-4 w-4" />
            ปิด
          </button>
        </div>
      </div>

      {/* ── Print document ────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[700px] pt-16 pb-12 px-6 print:pt-0 print:pb-0 print:px-0">

        {/* Header */}
        <div className="text-center mb-7 pb-5 border-b-2 border-slate-900">
          <h1 className="text-2xl font-bold tracking-wide">{shopName}</h1>
          {shopAddress && <p className="text-sm text-slate-600 mt-0.5">{shopAddress}</p>}
          {shopPhone   && <p className="text-sm text-slate-600">{shopPhone}</p>}
          <h2 className="mt-3 text-lg font-bold uppercase tracking-widest">
            Customer Statement — ใบสรุปรายการลูกค้า
          </h2>
        </div>

        {/* Customer info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1 mb-6 text-sm">
          <div className="flex gap-2">
            <span className="font-semibold w-24 shrink-0">ชื่อลูกค้า:</span>
            <span className="font-semibold">{customer.name}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-24 shrink-0">วันที่พิมพ์:</span>
            <span>{format(new Date(), 'dd MMMM yyyy', { locale: th })}</span>
          </div>
          {customer.phone && (
            <div className="flex gap-2">
              <span className="font-semibold w-24 shrink-0">โทร:</span>
              <span>{customer.phone}</span>
            </div>
          )}
          {customer.email && (
            <div className="flex gap-2">
              <span className="font-semibold w-24 shrink-0">อีเมล:</span>
              <span>{customer.email}</span>
            </div>
          )}
          {customer.address && (
            <div className="flex gap-2 col-span-2">
              <span className="font-semibold w-24 shrink-0">ที่อยู่:</span>
              <span>{customer.address}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-semibold w-24 shrink-0">แต้มสะสม:</span>
            <span>{customer.points.toLocaleString('th-TH')} pts</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-24 shrink-0">ยอดซื้อรวม:</span>
            <span className="font-semibold text-emerald-700">{fmt(totalSales)} บาท</span>
          </div>
        </div>

        {/* Outstanding balance alert */}
        {unpaid > 0.005 && (
          <div className="mb-5 p-3 border-2 border-red-400 rounded bg-red-50 text-sm flex justify-between items-center">
            <span className="font-semibold text-red-700">⚠ มียอดค้างชำระ</span>
            <span className="font-bold text-red-700 tabular-nums text-base">{fmt(unpaid)} บาท</span>
          </div>
        )}

        {/* Repair history */}
        {repairs.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ประวัติงานซ่อม ({repairs.length} รายการล่าสุด)</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-800">
                  <th className="text-left py-1.5 pr-2">เลขงาน</th>
                  <th className="text-left py-1.5 pr-2">อุปกรณ์</th>
                  <th className="text-left py-1.5 pr-2">วันรับ</th>
                  <th className="text-left py-1.5 pr-2">สถานะ</th>
                  <th className="text-right py-1.5 pr-2">ค่าซ่อม</th>
                  <th className="text-right py-1.5">ชำระ</th>
                </tr>
              </thead>
              <tbody>
                {repairs.map(r => (
                  <tr key={r.id} className="border-b border-slate-200">
                    <td className="py-1.5 pr-2 font-mono font-semibold">{r.ticketNumber}</td>
                    <td className="py-1.5 pr-2">{r.deviceBrand} {r.deviceModel}</td>
                    <td className="py-1.5 pr-2">{fmtDate(r.receivedAt)}</td>
                    <td className="py-1.5 pr-2">{REPAIR_STATUS[r.status] ?? r.status}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {r.finalCost != null ? fmt(r.finalCost) : '—'}
                    </td>
                    <td className={`py-1.5 text-right tabular-nums ${
                      r.paymentStatus === 'PENDING' && r.status === 'DELIVERED' ? 'text-red-600 font-semibold' : ''
                    }`}>
                      {PAY_STATUS[r.paymentStatus] ?? r.paymentStatus}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Sales history */}
        {sales.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ประวัติการซื้อ ({sales.length} รายการล่าสุด)</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-slate-800">
                  <th className="text-left py-1.5 pr-2">เลขที่ใบเสร็จ</th>
                  <th className="text-left py-1.5 pr-2">วันที่</th>
                  <th className="text-left py-1.5 pr-2">วิธีชำระ</th>
                  <th className="text-left py-1.5 pr-2">สถานะ</th>
                  <th className="text-right py-1.5">ยอด</th>
                </tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="border-b border-slate-200">
                    <td className="py-1.5 pr-2 font-mono">{s.receiptNumber}</td>
                    <td className="py-1.5 pr-2">{fmtDate(s.createdAt)}</td>
                    <td className="py-1.5 pr-2">{s.paymentMethod ?? '—'}</td>
                    <td className="py-1.5 pr-2">{s.status === 'COMPLETED' ? 'สำเร็จ' : s.status === 'REFUNDED' ? 'คืนเงิน' : s.status}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(s.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-400">
                  <td colSpan={4} className="py-1.5 text-right font-semibold">รวมยอดซื้อสินค้า</td>
                  <td className="py-1.5 text-right tabular-nums font-bold">
                    {fmt(sales.filter(s => s.status === 'COMPLETED').reduce((s, r) => s + Number(r.total), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Summary totals */}
        <div className="border-t-2 border-slate-900 pt-4 mb-8">
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 text-slate-600">รวมยอดซื้อทั้งหมด (ตลอดกาล)</td>
                <td className="py-1 text-right tabular-nums font-semibold">{fmt(totalSales)} บาท</td>
              </tr>
              <tr>
                <td className="py-1 text-slate-600">แต้มสะสมคงเหลือ</td>
                <td className="py-1 text-right tabular-nums font-semibold">{customer.points.toLocaleString('th-TH')} pts</td>
              </tr>
              {unpaid > 0.005 && (
                <tr className="text-red-600">
                  <td className="py-1 font-bold">ยอดค้างชำระ</td>
                  <td className="py-1 text-right tabular-nums font-bold">{fmt(unpaid)} บาท</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signature */}
        <div className="grid grid-cols-2 gap-8 mt-6 text-xs text-center text-slate-500">
          <div><div className="border-t border-slate-400 pt-2 mt-8">ผู้รับผิดชอบ</div></div>
          <div><div className="border-t border-slate-400 pt-2 mt-8">ลูกค้าได้รับทราบ</div></div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
          <span>พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}</span>
          <span>{customer.name} — {customer.phone ?? customer.email ?? customer.id}</span>
        </div>
      </div>
    </div>
  )
}
