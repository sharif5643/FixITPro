'use client'

import { use, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { SupplierStatement, ShopSettings } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yyyy') }
  catch { return d }
}

const PAY_METHOD_LABEL: Record<string, string> = {
  CASH:     'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD:     'บัตร',
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SupplierStatementPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }         = use(params)
  const searchParams   = useSearchParams()
  const autoPrintFired = useRef(false)

  const now = new Date()
  const startDate = searchParams.get('startDate') ?? format(startOfMonth(now), 'yyyy-MM-dd')
  const endDate   = searchParams.get('endDate')   ?? format(endOfMonth(now),   'yyyy-MM-dd')

  const { data: stmt, isLoading, isError } = useQuery<SupplierStatement>({
    queryKey: ['supplier-statement-print', id, startDate, endDate],
    queryFn:  () => api.get(`/suppliers/${id}/statement?startDate=${startDate}&endDate=${endDate}`).then(r => r.data),
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
      @page { size: A4 portrait; margin: 16mm 16mm 16mm 16mm; }
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
    if (!stmt || autoPrintFired.current) return
    autoPrintFired.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [stmt])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }
  if (isError || !stmt) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        ไม่พบข้อมูล Statement นี้
      </div>
    )
  }

  const shopName    = settings?.shopName    ?? 'FixITPro'
  const shopAddress = settings?.shopAddress ?? ''
  const shopPhone   = settings?.shopPhone   ?? ''
  const supplier    = stmt.supplier

  const totalOutstanding = stmt.outstandingPos.reduce((s, p) => s + p.balance, 0)

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ── Action bar (no-print) ─────────────────────────────────────── */}
      <div className="no-print fixed top-0 inset-x-0 bg-slate-800 text-white flex items-center justify-between px-6 py-3 z-50 shadow">
        <span className="text-sm font-medium">พิมพ์ Statement — {supplier.name}</span>
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
        <div className="text-center mb-8 pb-6 border-b-2 border-slate-900">
          <h1 className="text-2xl font-bold tracking-wide">{shopName}</h1>
          {shopAddress && <p className="text-sm text-slate-600 mt-0.5">{shopAddress}</p>}
          {shopPhone   && <p className="text-sm text-slate-600">{shopPhone}</p>}
          <h2 className="mt-4 text-lg font-bold uppercase tracking-widest">
            Supplier Statement — ใบแจ้งยอดเจ้าหนี้
          </h2>
        </div>

        {/* Supplier & period info */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-sm">
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">ซัพพลายเออร์:</span>
            <span className="font-semibold">{supplier.name}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">งวด:</span>
            <span>
              {fmtDate(startDate)} – {fmtDate(endDate)}
            </span>
          </div>
          {supplier.phone && (
            <div className="flex gap-2">
              <span className="font-semibold w-28 shrink-0">โทร:</span>
              <span>{supplier.phone}</span>
            </div>
          )}
          {supplier.taxId && (
            <div className="flex gap-2">
              <span className="font-semibold w-28 shrink-0">เลขผู้เสียภาษี:</span>
              <span className="font-mono">{supplier.taxId}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">เครดิต:</span>
            <span>{supplier.creditDays} วัน</span>
          </div>
        </div>

        {/* Statement summary */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-2 font-semibold">รายการ</th>
              <th className="text-right py-2 w-36 font-semibold">จำนวนเงิน (บาท)</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-2">ยอดยกมาต้นงวด</td>
              <td className="py-2 text-right tabular-nums">{fmt(stmt.openingBalance)}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2">ซื้อสินค้าในงวด</td>
              <td className="py-2 text-right tabular-nums">{fmt(stmt.purchases)}</td>
            </tr>
            <tr className="border-b border-slate-200">
              <td className="py-2 text-emerald-700">ชำระเงินในงวด</td>
              <td className="py-2 text-right tabular-nums text-emerald-700">({fmt(stmt.payments)})</td>
            </tr>
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900">
              <td className="py-2.5 font-bold">ยอดคงเหลือปลายงวด</td>
              <td className={`py-2.5 text-right tabular-nums font-bold text-base ${stmt.closingBalance > 0 ? 'text-red-600' : ''}`}>
                {fmt(stmt.closingBalance)}
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Outstanding POs */}
        {stmt.outstandingPos.length > 0 && (
          <div className="mb-6">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ใบสั่งซื้อค้างชำระ</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1.5 pr-3">เลขที่ PO</th>
                  <th className="text-left py-1.5 pr-3">วันที่สั่ง</th>
                  <th className="text-left py-1.5 pr-3">ครบกำหนด</th>
                  <th className="text-right py-1.5 pr-3">ยอดรวม</th>
                  <th className="text-right py-1.5 pr-3">ชำระแล้ว</th>
                  <th className="text-right py-1.5 pr-3">คงค้าง</th>
                  <th className="text-center py-1.5">เกินกำหนด</th>
                </tr>
              </thead>
              <tbody>
                {stmt.outstandingPos.map(po => (
                  <tr key={po.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3 font-mono font-semibold">{po.poNumber}</td>
                    <td className="py-1.5 pr-3">{fmtDate(po.orderDate)}</td>
                    <td className="py-1.5 pr-3">{fmtDate(po.dueDate)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(po.total)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{fmt(po.paidTotal)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums font-semibold text-red-600">{fmt(po.balance)}</td>
                    <td className={`py-1.5 text-center ${po.daysOverdue > 0 ? 'text-red-600 font-semibold' : 'text-slate-400'}`}>
                      {po.daysOverdue === 0 ? '—' : `${po.daysOverdue} วัน`}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-400">
                  <td colSpan={5} className="py-1.5 pr-3 text-right font-semibold">รวมค้างชำระ</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-bold text-red-600">{fmt(totalOutstanding)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Payment history */}
        {stmt.paymentHistory.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">การชำระเงินในงวด</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1.5 pr-3">วันที่</th>
                  <th className="text-left py-1.5 pr-3">อ้างอิง PO</th>
                  <th className="text-left py-1.5 pr-3">วิธีชำระ</th>
                  <th className="text-left py-1.5 pr-3">หมายเหตุ</th>
                  <th className="text-right py-1.5">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {stmt.paymentHistory.map(p => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{fmtDate(p.paidAt)}</td>
                    <td className="py-1.5 pr-3 font-mono">{p.poNumber}</td>
                    <td className="py-1.5 pr-3">{PAY_METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{p.note ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-emerald-700">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature section */}
        <div className="grid grid-cols-2 gap-8 mt-10 pt-4 text-xs text-center text-slate-500">
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้จัดทำ / {shopName}</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้รับ / {supplier.name}</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
          <span>พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}</span>
          <span>งวด {fmtDate(startDate)} – {fmtDate(endDate)}</span>
        </div>
      </div>
    </div>
  )
}
