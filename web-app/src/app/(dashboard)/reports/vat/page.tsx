'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Download, Printer, Receipt, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

type Tab = 'sales' | 'purchases' | 'pp30'

interface Shop { name: string; taxId: string | null; taxBranch: string; address: string | null; vatPercent: number }
interface SalesLine {
  id: string; date: string; number: string; kind: 'ABB' | 'CN' | 'FULL'; reference: string | null; branch: string | null
  customerName: string | null; customerTaxId: string | null; customerTaxBranch: string | null; refNumber: string | null
  vatBase: number; vatAmount: number; total: number; cancelled: boolean; cancelReason: string | null
}
interface PurchaseLine {
  id: string; poNumber: string; date: string; supplierTaxInvoiceNo: string | null; supplierName: string; supplierTaxId: string | null
  vatBase: number; vatAmount: number; total: number; missing: string | null
}
interface Report<L> { shop: Shop; month: string; lines: L[]; totals: Record<string, number> }
interface Pp30 {
  shop: Shop; month: string; salesBase: number; outputVat: number; purchaseBase: number; inputVat: number
  payable: number; carryForward: number; incompletePurchases: number; cancelledSales: number
}

const KIND: Record<string, string> = { ABB: 'อย่างย่อ', FULL: 'เต็มรูป', CN: 'ใบลดหนี้' }
const m2 = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' })
function thisMonth() {
  const d = new Date(Date.now() + 7 * 3600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

export default function VatReportPage() {
  const router = useRouter()
  const authorized = useAuthStore((s) => s.hasPermission)('reports.view')
  const [month, setMonth] = useState(thisMonth)
  const [tab, setTab] = useState<Tab>('sales')

  const sales = useQuery<Report<SalesLine>>({
    queryKey: ['tax-reports', 'sales', month],
    queryFn:  () => api.get('/tax-reports/sales', { params: { month } }).then((r) => r.data),
    enabled:  authorized,
  })
  const purchases = useQuery<Report<PurchaseLine>>({
    queryKey: ['tax-reports', 'purchases', month],
    queryFn:  () => api.get('/tax-reports/purchases', { params: { month } }).then((r) => r.data),
    enabled:  authorized,
  })
  const pp30 = useQuery<Pp30>({
    queryKey: ['tax-reports', 'pp30', month],
    queryFn:  () => api.get('/tax-reports/pp30', { params: { month } }).then((r) => r.data),
    enabled:  authorized,
  })
  const shop = sales.data?.shop ?? pp30.data?.shop

  const csv = useMemo(() => () => {
    if (tab === 'sales' && sales.data) {
      downloadCsv(`ภาษีขาย-${month}.csv`, [
        ['วันที่', 'เลขที่', 'ประเภท', 'อ้างอิง', 'ผู้ซื้อ', 'เลขประจำตัวผู้เสียภาษีผู้ซื้อ', 'สาขาผู้ซื้อ', 'มูลค่าก่อนภาษี', 'ภาษี', 'รวม', 'สถานะ'],
        ...sales.data.lines.map((l) => [day(l.date), l.number, KIND[l.kind], l.refNumber ?? l.reference ?? '', l.customerName ?? '',
          l.customerTaxId ?? '', l.customerTaxBranch ?? '', l.vatBase, l.vatAmount, l.total, l.cancelled ? `ยกเลิก: ${l.cancelReason ?? ''}` : '']),
        ['', '', '', '', '', '', 'รวม', sales.data.totals.vatBase, sales.data.totals.vatAmount, sales.data.totals.total, ''],
      ])
    } else if (tab === 'purchases' && purchases.data) {
      downloadCsv(`ภาษีซื้อ-${month}.csv`, [
        ['วันที่', 'เลขที่ใบกำกับภาษีผู้ขาย', 'ผู้ขาย', 'เลขประจำตัวผู้เสียภาษีผู้ขาย', 'ใบสั่งซื้อ', 'มูลค่าก่อนภาษี', 'ภาษี', 'รวม', 'หมายเหตุ'],
        ...purchases.data.lines.map((l) => [day(l.date), l.supplierTaxInvoiceNo ?? '', l.supplierName, l.supplierTaxId ?? '', l.poNumber,
          l.vatBase, l.vatAmount, l.total, l.missing ?? '']),
        ['', '', '', '', 'รวม (ที่ขอคืนได้)', purchases.data.totals.vatBase, purchases.data.totals.vatAmount, purchases.data.totals.total, ''],
      ])
    }
  }, [tab, sales.data, purchases.data, month])

  if (!authorized) {
    router.replace('/403')
    return null
  }

  const loading = tab === 'sales' ? sales.isLoading : tab === 'purchases' ? purchases.isLoading : pp30.isLoading
  const failed  = tab === 'sales' ? sales.error : tab === 'purchases' ? purchases.error : pp30.error

  return (
    <div className="space-y-5 max-w-6xl">
      <PageHeader
        title="รายงานภาษีมูลค่าเพิ่ม"
        subtitle="รายงานภาษีขาย รายงานภาษีซื้อ และยอดสำหรับยื่น ภ.พ.30 รายเดือน"
        icon={Receipt}
      />

      {shop && !(shop.vatPercent > 0) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-200">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-semibold">ร้านยังไม่ได้เก็บ VAT</p>
            <p>ร้านที่จดทะเบียนภาษีมูลค่าเพิ่มแล้ว ตั้งค่า VAT 7% และเลขประจำตัวผู้เสียภาษีที่ <Link href="/settings" className="font-semibold underline">ตั้งค่า → การเงิน</Link> — หลังจากนั้นทุกบิลจะออกเป็นใบกำกับภาษีอย่างย่อ</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <input
          type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)}
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
          aria-label="เดือน"
        />
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="tablist">
          {([['sales', 'ภาษีขาย'], ['purchases', 'ภาษีซื้อ'], ['pp30', 'สรุป ภ.พ.30']] as const).map(([k, label]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === k ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800')}>
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-2">
          {tab !== 'pp30' && <Button variant="outline" size="sm" onClick={csv}><Download className="mr-1.5 h-4 w-4" />Excel (CSV)</Button>}
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="mr-1.5 h-4 w-4" />พิมพ์</Button>
        </div>
      </div>

      {shop && (
        <div className="text-sm text-slate-700 dark:text-slate-300">
          <p className="font-semibold">{tab === 'sales' ? 'รายงานภาษีขาย' : tab === 'purchases' ? 'รายงานภาษีซื้อ' : 'สรุปภาษีมูลค่าเพิ่ม (ภ.พ.30)'} เดือน {sales.data?.month ?? pp30.data?.month}</p>
          <p>ชื่อผู้ประกอบการ {shop.name} · เลขประจำตัวผู้เสียภาษี {shop.taxId ?? '—'} · {shop.taxBranch}</p>
          {shop.address && <p className="text-slate-500">{shop.address}</p>}
        </div>
      )}

      {loading && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
      {failed && <p className="text-sm text-red-600">โหลดรายงานไม่ได้</p>}

      {tab === 'sales' && sales.data && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2">วันที่</th><th className="px-3 py-2">เลขที่</th><th className="px-3 py-2">ประเภท</th>
                <th className="px-3 py-2">ผู้ซื้อ</th><th className="px-3 py-2 text-right">มูลค่าก่อนภาษี</th>
                <th className="px-3 py-2 text-right">ภาษี</th><th className="px-3 py-2 text-right">รวม</th>
              </tr>
            </thead>
            <tbody>
              {sales.data.lines.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">เดือนนี้ยังไม่มีใบกำกับภาษี</td></tr>
              )}
              {sales.data.lines.map((l) => (
                <tr key={l.id} className={cn('border-t border-slate-100 dark:border-slate-800', l.cancelled && 'text-slate-400 line-through decoration-slate-300')}>
                  <td className="px-3 py-2 whitespace-nowrap">{day(l.date)}</td>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">{l.number}{l.refNumber && <span className="block text-slate-400 no-underline">ลด {l.refNumber}</span>}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{KIND[l.kind]}{l.cancelled && <span className="ml-1 rounded bg-slate-100 px-1 text-[11px] no-underline dark:bg-slate-800">ยกเลิก</span>}</td>
                  <td className="px-3 py-2">
                    {l.customerName ?? (l.kind === 'ABB' ? <span className="text-slate-400">ขายปลีก</span> : '—')}
                    {l.customerTaxId && <span className="block text-xs text-slate-500">{l.customerTaxId}{l.customerTaxBranch ? ` · ${l.customerTaxBranch}` : ''}</span>}
                    {l.cancelled && l.cancelReason && <span className="block text-xs text-slate-500 no-underline">{l.cancelReason}</span>}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(l.vatBase)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(l.vatAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(l.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
              <tr>
                <td className="px-3 py-2" colSpan={4}>รวม {sales.data.totals.documents} ฉบับ{sales.data.totals.cancelled ? ` (ยกเลิก ${sales.data.totals.cancelled} ฉบับ ไม่นับรวม)` : ''}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m2(sales.data.totals.vatBase)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m2(sales.data.totals.vatAmount)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{m2(sales.data.totals.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {tab === 'purchases' && purchases.data && (
        <>
          {purchases.data.totals.incomplete > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              {purchases.data.totals.incomplete} รายการยังขอคืนภาษีไม่ได้ — ใส่เลขที่ใบกำกับภาษีของผู้ขายในหน้าใบสั่งซื้อ และเลขประจำตัวผู้เสียภาษีของผู้ขายในหน้าซัพพลายเออร์
            </p>
          )}
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2">วันที่</th><th className="px-3 py-2">เลขที่ใบกำกับภาษี</th><th className="px-3 py-2">ผู้ขาย</th>
                  <th className="px-3 py-2 text-right">มูลค่าก่อนภาษี</th><th className="px-3 py-2 text-right">ภาษี</th><th className="px-3 py-2 text-right">รวม</th>
                </tr>
              </thead>
              <tbody>
                {purchases.data.lines.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">เดือนนี้ยังไม่มีใบสั่งซื้อที่มี VAT</td></tr>
                )}
                {purchases.data.lines.map((l) => (
                  <tr key={l.id} className={cn('border-t border-slate-100 dark:border-slate-800', l.missing && 'bg-amber-50/60 dark:bg-amber-900/10')}>
                    <td className="px-3 py-2 whitespace-nowrap">{day(l.date)}</td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-xs">{l.supplierTaxInvoiceNo ?? '—'}</span>
                      <Link href="/purchase-orders" className="block text-xs text-blue-600 hover:underline dark:text-blue-400">{l.poNumber}</Link>
                    </td>
                    <td className="px-3 py-2">
                      {l.supplierName}
                      <span className="block text-xs text-slate-500">{l.supplierTaxId ?? 'ไม่มีเลขประจำตัวผู้เสียภาษี'}</span>
                      {l.missing && <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">{l.missing}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{m2(l.vatBase)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m2(l.vatAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m2(l.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                <tr>
                  <td className="px-3 py-2" colSpan={3}>รวมที่ขอคืนได้ {purchases.data.totals.documents} ฉบับ</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(purchases.data.totals.vatBase)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(purchases.data.totals.vatAmount)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m2(purchases.data.totals.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="text-xs text-slate-500">ค่าใช้จ่ายอื่นที่มี VAT (ค่าเช่า ค่าไฟ ฯลฯ) ยังไม่รวมในรายงานนี้ — นักบัญชีเพิ่มเองตอนยื่น</p>
        </>
      )}

      {tab === 'pp30' && pp30.data && (
        <div className="max-w-xl space-y-3">
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm dark:divide-slate-800 dark:border-slate-700">
            {([
              ['ยอดขายที่ต้องเสียภาษี (มูลค่าก่อนภาษี)', pp30.data.salesBase],
              ['ภาษีขาย', pp30.data.outputVat],
              ['ยอดซื้อที่ขอคืนภาษีได้ (มูลค่าก่อนภาษี)', pp30.data.purchaseBase],
              ['ภาษีซื้อ', pp30.data.inputVat],
            ] as const).map(([label, v]) => (
              <div key={label} className="flex justify-between px-4 py-2.5"><span>{label}</span><span className="tabular-nums">{m2(v)}</span></div>
            ))}
            <div className="flex justify-between bg-slate-50 px-4 py-3 font-semibold dark:bg-slate-800/60">
              {pp30.data.payable > 0
                ? <><span>ภาษีที่ต้องชำระ</span><span className="tabular-nums text-red-700 dark:text-red-400">{m2(pp30.data.payable)}</span></>
                : <><span>ภาษีชำระเกิน (ยกไปเดือนถัดไป)</span><span className="tabular-nums text-emerald-700 dark:text-emerald-400">{m2(pp30.data.carryForward)}</span></>}
            </div>
          </div>
          {pp30.data.incompletePurchases > 0 && (
            <p className="text-sm text-amber-700 dark:text-amber-300">มีใบสั่งซื้อ {pp30.data.incompletePurchases} รายการที่ยังไม่นับเป็นภาษีซื้อ (ขาดเลขที่ใบกำกับภาษีของผู้ขาย)</p>
          )}
          <p className="text-xs text-slate-500">ยื่นภายในวันที่ 15 ของเดือนถัดไป (ยื่นออนไลน์ได้ถึงวันที่ 23) · ตัวเลขนี้ช่วยกรอกแบบ ภ.พ.30 ควรให้นักบัญชีตรวจก่อนยื่น</p>
        </div>
      )}
    </div>
  )
}
