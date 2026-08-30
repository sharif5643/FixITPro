'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { PurchaseOrder, ShopSettings } from '@/types'

// ── Status labels ─────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  DRAFT:            'ร่าง',
  ORDERED:          'สั่งซื้อแล้ว',
  PARTIAL_RECEIVED: 'รับบางส่วน',
  RECEIVED:         'รับครบแล้ว',
  CANCELLED:        'ยกเลิก',
}

const PAY_STATUS_LABEL: Record<string, string> = {
  UNPAID:   'ยังไม่ชำระ',
  PARTIAL:  'ชำระบางส่วน',
  PAID:     'ชำระแล้ว',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
  return (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try { return format(new Date(d), 'dd MMMM yyyy', { locale: th }) }
  catch { return d }
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function PurchaseOrderPrintPage() {
  const { id }         = useParams<{ id: string }>()
  const autoPrintFired = useRef(false)

  const { data: po, isLoading, isError } = useQuery<PurchaseOrder>({
    queryKey: ['po-print', id],
    queryFn:  () => api.get(`/purchase-orders/${id}`).then(r => r.data),
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
    if (!po || autoPrintFired.current) return
    autoPrintFired.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [po])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }
  if (isError || !po) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        ไม่พบใบสั่งซื้อนี้
      </div>
    )
  }

  const shopName    = settings?.shopName    ?? 'FixITPro'
  const shopAddress = settings?.shopAddress ?? ''
  const shopPhone   = settings?.shopPhone   ?? ''

  const paidTotal   = Number(po.paidTotal   ?? 0)
  const remaining   = Number(po.total ?? 0) - paidTotal
  const isCancelled = po.status === 'CANCELLED'

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ── Action bar (no-print) ─────────────────────────────────────── */}
      <div className="no-print fixed top-0 inset-x-0 bg-slate-800 text-white flex items-center justify-between px-6 py-3 z-50 shadow">
        <span className="text-sm font-medium">พิมพ์ใบสั่งซื้อ {po.poNumber}</span>
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
            ใบสั่งซื้อ (Purchase Order)
          </h2>
          {isCancelled && (
            <p className="mt-2 text-red-600 font-bold text-sm tracking-widest border border-red-400 rounded px-3 py-1 inline-block">
              ยกเลิกแล้ว (CANCELLED)
            </p>
          )}
        </div>

        {/* PO metadata */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-sm">
          <div className="flex gap-2">
            <span className="font-semibold w-32 shrink-0">เลขที่ PO:</span>
            <span className="font-mono font-bold">{po.poNumber}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-32 shrink-0">วันที่สั่งซื้อ:</span>
            <span>{fmtDate(po.orderDate ?? po.createdAt)}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-32 shrink-0">ซัพพลายเออร์:</span>
            <span>{po.supplier.name}</span>
          </div>
          {po.supplier.phone && (
            <div className="flex gap-2">
              <span className="font-semibold w-32 shrink-0">โทร:</span>
              <span>{po.supplier.phone}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-semibold w-32 shrink-0">สถานะ:</span>
            <span>{STATUS_LABEL[po.status] ?? po.status}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-32 shrink-0">สถานะชำระ:</span>
            <span>{PAY_STATUS_LABEL[po.paymentStatus] ?? po.paymentStatus}</span>
          </div>
          {po.expectedDate && (
            <div className="flex gap-2">
              <span className="font-semibold w-32 shrink-0">กำหนดรับ:</span>
              <span>{fmtDate(po.expectedDate)}</span>
            </div>
          )}
          {po.branch && (
            <div className="flex gap-2">
              <span className="font-semibold w-32 shrink-0">สาขา:</span>
              <span>{po.branch.name}</span>
            </div>
          )}
          <div className="flex gap-2">
            <span className="font-semibold w-32 shrink-0">ผู้สั่งซื้อ:</span>
            <span>{po.createdBy.name}</span>
          </div>
        </div>

        {/* Items table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-2 pr-3 w-8 font-semibold">#</th>
              <th className="text-left py-2 pr-3 w-20 font-semibold">SKU</th>
              <th className="text-left py-2 pr-3 font-semibold">ชื่อสินค้า</th>
              <th className="text-right py-2 pr-3 w-16 font-semibold">สั่ง</th>
              <th className="text-right py-2 pr-3 w-16 font-semibold">รับแล้ว</th>
              <th className="text-right py-2 pr-3 w-24 font-semibold">ราคา/หน่วย</th>
              <th className="text-right py-2 w-24 font-semibold">รวม</th>
            </tr>
          </thead>
          <tbody>
            {po.items.map((item, idx) => (
              <tr key={item.id} className="border-b border-slate-200">
                <td className="py-2 pr-3 text-slate-400">{idx + 1}</td>
                <td className="py-2 pr-3 font-mono text-xs text-slate-500">{item.product.sku ?? '—'}</td>
                <td className="py-2 pr-3">{item.product.name}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{item.quantity}</td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-500">{item.receivedQty}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmt(item.unitCost)}</td>
                <td className="py-2 text-right tabular-nums font-medium">{fmt(item.total)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {/* Subtotal */}
            <tr className="border-t border-slate-300">
              <td colSpan={6} className="py-2 pr-3 text-right text-sm">ราคารวม (ก่อน VAT)</td>
              <td className="py-2 text-right tabular-nums text-sm">{fmt(po.subtotal)}</td>
            </tr>
            {/* Discount */}
            {Number(po.discount) > 0 && (
              <tr>
                <td colSpan={6} className="py-1 pr-3 text-right text-sm text-red-600">ส่วนลด</td>
                <td className="py-1 text-right tabular-nums text-sm text-red-600">-{fmt(po.discount)}</td>
              </tr>
            )}
            {/* VAT */}
            {Number(po.vatAmount) > 0 && (
              <tr>
                <td colSpan={6} className="py-1 pr-3 text-right text-sm">VAT {po.vatPercent}%</td>
                <td className="py-1 text-right tabular-nums text-sm">{fmt(po.vatAmount)}</td>
              </tr>
            )}
            {/* Grand total */}
            <tr className="border-t-2 border-slate-900">
              <td colSpan={6} className="py-2.5 pr-3 text-right font-bold">ยอดรวมสุทธิ</td>
              <td className="py-2.5 text-right tabular-nums font-bold text-base">{fmt(po.total)}</td>
            </tr>
            {/* Paid / remaining */}
            <tr>
              <td colSpan={6} className="py-1 pr-3 text-right text-sm text-emerald-700">ชำระแล้ว</td>
              <td className="py-1 text-right tabular-nums text-sm text-emerald-700">{fmt(paidTotal)}</td>
            </tr>
            {remaining > 0.005 && (
              <tr>
                <td colSpan={6} className="py-1 pr-3 text-right text-sm font-semibold text-red-600">ยังค้างชำระ</td>
                <td className="py-1 text-right tabular-nums text-sm font-semibold text-red-600">{fmt(remaining)}</td>
              </tr>
            )}
          </tfoot>
        </table>

        {/* Note */}
        {po.note && (
          <div className="mb-6 p-3 bg-slate-50 rounded border border-slate-200 text-sm">
            <span className="font-semibold">หมายเหตุ: </span>{po.note}
          </div>
        )}

        {/* Payments summary */}
        {po.payments && po.payments.length > 0 && (
          <div className="mb-8">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">ประวัติการชำระเงิน</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-1.5 pr-3">วันที่ชำระ</th>
                  <th className="text-left py-1.5 pr-3">วิธีชำระ</th>
                  <th className="text-left py-1.5 pr-3">หมายเหตุ</th>
                  <th className="text-right py-1.5">จำนวน</th>
                </tr>
              </thead>
              <tbody>
                {po.payments.map((p: any) => (
                  <tr key={p.id} className="border-b border-slate-100">
                    <td className="py-1.5 pr-3">{fmtDate(p.paidAt)}</td>
                    <td className="py-1.5 pr-3">{p.method ?? '—'}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{p.note ?? '—'}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Signature section */}
        <div className="grid grid-cols-3 gap-4 mt-10 pt-4 text-xs text-center text-slate-500">
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้สั่งซื้อ</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้อนุมัติ</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้รับสินค้า</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
          <span>พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}</span>
          <span>{po.poNumber}</span>
        </div>
      </div>
    </div>
  )
}
