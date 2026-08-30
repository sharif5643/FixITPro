'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyReport {
  date: string
  sales: {
    count: number
    totalRevenue: number
    totalDiscount: number
    paymentBreakdown: Record<string, number>
  }
  voidedSales: { count: number; totalAmount: number }
  packageSales: { count: number; totalPackageAmount: number; totalProfit: number }
  repairPayments: {
    count: number
    totalRevenue: number
    paymentBreakdown: Record<string, number>
  }
  repairs: { count: number; byStatus: Record<string, number> }
  supplierPayments: {
    count: number
    totalAmount: number
    paymentBreakdown: Record<string, number>
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtDateThai(d: string): string {
  try { return format(new Date(d), 'dd MMMM yyyy', { locale: th }) }
  catch { return d }
}

function fmtTime(d: string): string {
  try { return format(new Date(d), 'HH:mm น.', { locale: th }) }
  catch { return d }
}

const PAY_LABEL: Record<string, string> = {
  CASH: 'เงินสด', TRANSFER: 'โอนเงิน', CARD: 'บัตร',
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'รับงานใหม่', DIAGNOSING: 'วินิจฉัย', IN_PROGRESS: 'กำลังซ่อม',
  WAITING_PARTS: 'รออะไหล่', WAITING_APPROVAL: 'รออนุมัติ', QC_PENDING: 'รอ QC',
  COMPLETED: 'ซ่อมเสร็จ', READY_PICKUP: 'รอรับ', DELIVERED: 'ส่งมอบแล้ว', CANCELLED: 'ยกเลิก',
}

// ── Row component ─────────────────────────────────────────────────────────────

function Row({ label, value, bold, sub, red }: {
  label: string; value: string; bold?: boolean; sub?: boolean; red?: boolean
}) {
  return (
    <tr className={`border-b border-slate-100 ${sub ? 'text-slate-500' : ''}`}>
      <td className={`py-1 pr-4 ${sub ? 'pl-4 text-xs' : 'text-sm'} ${bold ? 'font-bold' : ''}`}>{label}</td>
      <td className={`py-1 text-right tabular-nums ${sub ? 'text-xs' : 'text-sm'} ${bold ? 'font-bold' : ''} ${red ? 'text-red-600 font-semibold' : ''}`}>
        {value}
      </td>
    </tr>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function DailyClosePrintPage() {
  const params       = useParams<{ date: string }>()
  const date         = params?.date ?? ''
  const autoPrintFired = useRef(false)

  // Parse query params client-side only (avoids useSearchParams SSR issues)
  const [qp, setQp] = useState<URLSearchParams>(() =>
    typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  )
  useEffect(() => { setQp(new URLSearchParams(window.location.search)) }, [])

  const staffName       = qp.get('staffName')      ?? ''
  const openedAt        = qp.get('openedAt')       ?? ''
  const closedAt        = qp.get('closedAt')       ?? ''
  const openBalance     = Number(qp.get('openBalance')     ?? 0)
  const closeBalance    = Number(qp.get('closeBalance')    ?? 0)
  const expectedBalance = Number(qp.get('expectedBalance') ?? 0)
  const difference      = Number(qp.get('difference')      ?? 0)

  const { data: report, isLoading, isError } = useQuery<DailyReport>({
    queryKey: ['daily-close-print', date],
    queryFn:  () => api.get(`/reports/daily-closing?date=${date}`).then(r => r.data),
    staleTime: 300_000,
    retry: 1,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  () => api.get('/settings').then(r => r.data),
    staleTime: 60_000,
  })

  const paper = qp.get('paper') ?? 'A4'
  const isThermal = paper === '80mm' || paper === '58mm'

  // Inject @page CSS based on paper size
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-page-size'
    if (paper === '80mm') {
      style.textContent = `
        @page { size: 80mm auto; margin: 2mm 3mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print  { display: none !important; }
        }
      `
    } else if (paper === '58mm') {
      style.textContent = `
        @page { size: 58mm auto; margin: 1mm 2mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print  { display: none !important; }
        }
      `
    } else {
      style.textContent = `
        @page { size: A4 portrait; margin: 14mm 14mm 16mm 14mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print  { display: none !important; }
        }
      `
    }
    document.head.appendChild(style)
    return () => { style.remove() }
  }, [paper])

  // Auto-print
  useEffect(() => {
    if (!report || autoPrintFired.current) return
    autoPrintFired.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [report])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลดรายงาน...</span>
      </div>
    )
  }
  if (isError || !report) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        ไม่สามารถโหลดรายงานได้
      </div>
    )
  }

  const shopName    = settings?.shopName    ?? 'FixITPro'
  const shopAddress = settings?.shopAddress ?? ''
  const shopPhone   = settings?.shopPhone   ?? ''

  // ── Computed totals ──
  const totalRevenue  = report.sales.totalRevenue + report.repairPayments.totalRevenue + report.packageSales.totalProfit
  const totalExpenses = report.supplierPayments.totalAmount
  const netIncome     = totalRevenue - totalExpenses

  // Combined payment breakdown (sales + repairs)
  const allPayMethods = ['CASH', 'TRANSFER', 'CARD']
  const combinedIn: Record<string, number> = {}
  for (const m of allPayMethods) {
    combinedIn[m] = (report.sales.paymentBreakdown[m] ?? 0) + (report.repairPayments.paymentBreakdown[m] ?? 0)
  }

  // Repair status summary
  const repairStatuses = Object.entries(report.repairs.byStatus).filter(([, v]) => v > 0)

  if (isThermal) {
    return (
      <div style={{ background: '#fff', color: '#000', minHeight: '100vh', fontFamily: 'monospace' }}>
        {/* Action bar */}
        <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, background: '#1e293b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 16px', zIndex: 50 }}>
          <span style={{ fontSize: 13 }}>รายงานปิดกะ ({paper}) — {fmtDateThai(date)}</span>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => window.print()} style={{ background: '#fff', color: '#1e293b', border: 'none', borderRadius: 4, padding: '4px 12px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Printer size={14} /> พิมพ์
            </button>
            <button onClick={() => window.close()} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Thermal content */}
        <div style={{ maxWidth: paper === '58mm' ? '54mm' : '76mm', margin: '0 auto', paddingTop: 50, paddingBottom: 8 }} className="print:pt-0">
          <div style={{ textAlign: 'center', marginBottom: 6, borderBottom: '1px dashed #000', paddingBottom: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>{settings?.shopName ?? 'FixITPro'}</div>
            {settings?.shopAddress && <div style={{ fontSize: 10 }}>{settings.shopAddress}</div>}
            {settings?.shopPhone   && <div style={{ fontSize: 10 }}>{settings.shopPhone}</div>}
            <div style={{ fontWeight: 700, marginTop: 4, fontSize: 12 }}>รายงานปิดกะ</div>
            <div style={{ fontSize: 11 }}>{fmtDateThai(date)}</div>
            {staffName && <div style={{ fontSize: 10 }}>พนักงาน: {staffName}</div>}
            {openedAt  && <div style={{ fontSize: 10 }}>เปิด: {fmtTime(openedAt)} {closedAt ? `ปิด: ${fmtTime(closedAt)}` : ''}</div>}
          </div>

          {/* Revenue rows */}
          {[
            { label: `ยอดขาย (${report.sales.count} บิล)`, val: report.sales.totalRevenue },
            { label: `ค่าซ่อม (${report.repairPayments.count} งาน)`, val: report.repairPayments.totalRevenue, show: report.repairPayments.count > 0 },
            { label: `Package (${report.packageSales.count})`, val: report.packageSales.totalProfit, show: report.packageSales.count > 0 },
          ].filter(r => r.show !== false).map(r => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span>{r.label}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(r.val)}</span>
            </div>
          ))}
          {totalExpenses > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
              <span>รายจ่าย</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>({fmt(totalExpenses)})</span>
            </div>
          )}
          <div style={{ borderTop: '1px solid #000', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: 13 }}>
            <span>กำไรสุทธิ</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(netIncome)}</span>
          </div>

          {/* Cash check */}
          <div style={{ borderTop: '1px dashed #000', marginTop: 8, paddingTop: 6 }}>
            <div style={{ fontWeight: 700, fontSize: 11, marginBottom: 4 }}>ตรวจนับเงินสด</div>
            {expectedBalance > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>ยอดที่ควรมี</span><span>{fmt(expectedBalance)}</span>
              </div>
            )}
            {closeBalance > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                <span>นับจริง</span><span>{fmt(closeBalance)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, borderTop: '1px solid #000', marginTop: 4, paddingTop: 3 }}>
              <span>ส่วนต่าง</span>
              <span>{difference === 0 ? 'ถูกต้อง ✓' : `${difference > 0 ? '+' : ''}${fmt(difference)}`}</span>
            </div>
          </div>

          <div style={{ textAlign: 'center', marginTop: 10, borderTop: '1px dashed #000', paddingTop: 6, fontSize: 10, color: '#666' }}>
            พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ── Action bar ────────────────────────────────────────────── */}
      <div className="no-print fixed top-0 inset-x-0 bg-slate-800 text-white flex items-center justify-between px-6 py-3 z-50 shadow">
        <span className="text-sm font-medium">รายงานปิดกะ — {fmtDateThai(date)}</span>
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 bg-white text-slate-900 text-sm font-semibold px-4 py-1.5 rounded-md hover:bg-slate-100 transition-colors"
          >
            <Printer className="h-4 w-4" /> พิมพ์
          </button>
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 text-slate-300 hover:text-white text-sm transition-colors"
          >
            <X className="h-4 w-4" /> ปิด
          </button>
        </div>
      </div>

      {/* ── Document ──────────────────────────────────────────────── */}
      <div className="mx-auto max-w-[680px] pt-16 pb-12 px-6 print:pt-0 print:pb-0 print:px-0">

        {/* Header */}
        <div className="text-center mb-6 pb-5 border-b-2 border-slate-900">
          <h1 className="text-xl font-bold tracking-wide">{shopName}</h1>
          {shopAddress && <p className="text-xs text-slate-500 mt-0.5">{shopAddress}</p>}
          {shopPhone   && <p className="text-xs text-slate-500">{shopPhone}</p>}
          <h2 className="mt-3 text-base font-bold uppercase tracking-widest">รายงานปิดกะประจำวัน</h2>
          <p className="text-sm font-semibold mt-1">{fmtDateThai(date)}</p>
        </div>

        {/* Shift info */}
        {(staffName || openedAt || closedAt) && (
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-5 text-sm border border-slate-200 rounded p-3 bg-slate-50">
            {staffName && (
              <div className="flex gap-2">
                <span className="font-semibold w-24 shrink-0">พนักงาน:</span>
                <span>{staffName}</span>
              </div>
            )}
            <div className="flex gap-2">
              <span className="font-semibold w-24 shrink-0">วันที่:</span>
              <span>{fmtDateThai(date)}</span>
            </div>
            {openedAt && (
              <div className="flex gap-2">
                <span className="font-semibold w-24 shrink-0">เปิดกะ:</span>
                <span>{fmtTime(openedAt)}</span>
              </div>
            )}
            {closedAt && (
              <div className="flex gap-2">
                <span className="font-semibold w-24 shrink-0">ปิดกะ:</span>
                <span>{fmtTime(closedAt)}</span>
              </div>
            )}
          </div>
        )}

        {/* ── Section 1: รายรับ ── */}
        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5 mt-4">รายรับ</p>
        <table className="w-full text-sm border-collapse mb-4">
          <tbody>
            {/* Sales */}
            <Row label={`ยอดขายสินค้า (${report.sales.count} บิล)`} value={`${fmt(report.sales.totalRevenue)} บาท`} />
            {allPayMethods.filter(m => (report.sales.paymentBreakdown[m] ?? 0) > 0).map(m => (
              <Row key={`sale-${m}`} label={PAY_LABEL[m] ?? m} value={`${fmt(report.sales.paymentBreakdown[m])} บาท`} sub />
            ))}
            {report.sales.totalDiscount > 0 && (
              <Row label="ส่วนลดสินค้า" value={`(${fmt(report.sales.totalDiscount)}) บาท`} sub />
            )}

            {/* Repairs */}
            {report.repairPayments.count > 0 && (
              <>
                <Row label={`ค่าซ่อม (${report.repairPayments.count} งาน)`} value={`${fmt(report.repairPayments.totalRevenue)} บาท`} />
                {allPayMethods.filter(m => (report.repairPayments.paymentBreakdown[m] ?? 0) > 0).map(m => (
                  <Row key={`rep-${m}`} label={PAY_LABEL[m] ?? m} value={`${fmt(report.repairPayments.paymentBreakdown[m])} บาท`} sub />
                ))}
              </>
            )}

            {/* Package sales */}
            {report.packageSales.count > 0 && (
              <Row label={`Package/ซิม (${report.packageSales.count} รายการ)`} value={`${fmt(report.packageSales.totalProfit)} บาท`} />
            )}

            {/* Total revenue */}
            <tr className="border-t-2 border-slate-800">
              <td className="py-2 font-bold text-sm">รวมรายรับทั้งหมด</td>
              <td className="py-2 text-right tabular-nums font-bold text-emerald-700 text-base">{fmt(totalRevenue)} บาท</td>
            </tr>
          </tbody>
        </table>

        {/* ── Section 2: รายจ่าย ── */}
        {totalExpenses > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">รายจ่าย</p>
            <table className="w-full text-sm border-collapse mb-4">
              <tbody>
                <Row label={`ชำระซัพพลายเออร์ (${report.supplierPayments.count} รายการ)`} value={`${fmt(totalExpenses)} บาท`} />
                {allPayMethods.filter(m => (report.supplierPayments.paymentBreakdown[m] ?? 0) > 0).map(m => (
                  <Row key={`exp-${m}`} label={PAY_LABEL[m] ?? m} value={`${fmt(report.supplierPayments.paymentBreakdown[m])} บาท`} sub />
                ))}
                <tr className="border-t-2 border-slate-800">
                  <td className="py-2 font-bold text-sm">รวมรายจ่าย</td>
                  <td className="py-2 text-right tabular-nums font-bold text-red-600 text-base">{fmt(totalExpenses)} บาท</td>
                </tr>
              </tbody>
            </table>
          </>
        )}

        {/* ── Section 3: กำไรสุทธิ ── */}
        <div className={`flex items-center justify-between px-4 py-3 rounded mb-5 ${netIncome >= 0 ? 'bg-emerald-50 border border-emerald-200' : 'bg-red-50 border border-red-200'}`}>
          <span className="font-bold text-sm">กำไรสุทธิวันนี้</span>
          <span className={`font-extrabold text-xl tabular-nums ${netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {fmt(netIncome)} บาท
          </span>
        </div>

        {/* ── Section 4: ตรวจเงินสด ── */}
        {(openedAt || closeBalance > 0) && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">ตรวจนับเงินสด</p>
            <table className="w-full text-sm border-collapse mb-5">
              <tbody>
                {openBalance > 0 && <Row label="ยอดเงินสดต้นกะ" value={`${fmt(openBalance)} บาท`} />}
                {combinedIn.CASH > 0 && <Row label="เงินสดรับ (ขาย + ซ่อม)" value={`${fmt(combinedIn.CASH)} บาท`} />}
                {(report.supplierPayments.paymentBreakdown.CASH ?? 0) > 0 && (
                  <Row label="เงินสดจ่าย (ซัพพลายเออร์)" value={`(${fmt(report.supplierPayments.paymentBreakdown.CASH)}) บาท`} />
                )}
                {expectedBalance > 0 && <Row label="ยอดเงินสดที่ควรมี" value={`${fmt(expectedBalance)} บาท`} />}
                {closeBalance > 0 && <Row label="นับจริง" value={`${fmt(closeBalance)} บาท`} bold />}
                {(openedAt || closeBalance > 0) && (
                  <tr className="border-t-2 border-slate-800">
                    <td className="py-2 font-bold text-sm">ส่วนต่าง</td>
                    <td className={`py-2 text-right tabular-nums font-bold text-base ${
                      difference === 0 ? 'text-slate-700' : difference > 0 ? 'text-emerald-700' : 'text-red-600'
                    }`}>
                      {difference === 0 ? 'ถูกต้อง ✓' : `${difference > 0 ? '+' : ''}${fmt(difference)} บาท`}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {/* ── Section 5: สถานะงานซ่อม ── */}
        {report.repairs.count > 0 && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1.5">สรุปงานซ่อม ({report.repairs.count} งานในวัน)</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {repairStatuses.map(([status, count]) => (
                <div key={status} className="border border-slate-200 rounded px-2.5 py-1 text-xs">
                  <span className="text-slate-500">{STATUS_LABEL[status] ?? status}: </span>
                  <span className="font-bold">{count}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Summary box ── */}
        <table className="w-full text-xs border border-slate-300 mb-6">
          <thead className="bg-slate-100">
            <tr>
              <th className="text-left py-1.5 px-3 font-semibold">รายการ</th>
              <th className="text-right py-1.5 px-3 font-semibold">จำนวน</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-slate-200">
              <td className="py-1.5 px-3">ยอดขายสินค้า</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{fmt(report.sales.totalRevenue)} บาท</td>
            </tr>
            <tr className="border-t border-slate-200">
              <td className="py-1.5 px-3">ค่าซ่อม</td>
              <td className="py-1.5 px-3 text-right tabular-nums">{fmt(report.repairPayments.totalRevenue)} บาท</td>
            </tr>
            {report.packageSales.count > 0 && (
              <tr className="border-t border-slate-200">
                <td className="py-1.5 px-3">Package/ซิม</td>
                <td className="py-1.5 px-3 text-right tabular-nums">{fmt(report.packageSales.totalProfit)} บาท</td>
              </tr>
            )}
            {totalExpenses > 0 && (
              <tr className="border-t border-slate-200 text-red-600">
                <td className="py-1.5 px-3">รายจ่าย</td>
                <td className="py-1.5 px-3 text-right tabular-nums">({fmt(totalExpenses)}) บาท</td>
              </tr>
            )}
            <tr className="border-t-2 border-slate-600 bg-slate-50 font-bold">
              <td className="py-2 px-3">กำไรสุทธิ</td>
              <td className={`py-2 px-3 text-right tabular-nums ${netIncome >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                {fmt(netIncome)} บาท
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── Signature ── */}
        <div className="grid grid-cols-2 gap-10 mt-8 text-xs text-center text-slate-500">
          <div>
            <div className="border-t border-slate-400 pt-2 mt-10">
              {staffName ? `${staffName} — พนักงาน` : 'พนักงานผู้ปิดกะ'}
            </div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mt-10">
              เจ้าของ / ผู้จัดการ
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-3 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
          <span>พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}</span>
          <span>{shopName} — รายงานปิดกะ {fmtDateThai(date)}</span>
        </div>
      </div>
    </div>
  )
}
