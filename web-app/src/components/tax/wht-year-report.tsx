'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'

interface WhtLine {
  id: string; date: string; ticketNumber: string | null; repairId: string
  payerName: string; payerTaxId: string | null; certificateNo: string | null
  ratePercent: number; baseAmount: number; amount: number; cancelled: boolean; cancelReason: string | null
}
interface WhtReport { year: number; lines: WhtLine[]; totals: { amount: number; baseAmount: number; certificates: number } }

const m2 = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' })
const thisYearBE = () => new Date(Date.now() + 7 * 3600_000).getUTCFullYear() + 543

function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/**
 * Withholding tax certificates the shop received in a year — the tax it already paid in advance,
 * deducted on its yearly income tax (ภ.ง.ด.90/94 for a person, ภ.ง.ด.50/51 for a company).
 */
export function WhtYearReport() {
  const [year, setYear] = useState(thisYearBE)
  const q = useQuery<WhtReport>({
    queryKey: ['withholding-tax', 'report', year],
    queryFn:  () => api.get('/withholding-tax/report', { params: { year } }).then((r) => r.data),
  })
  const years = Array.from({ length: 4 }, (_, i) => thisYearBE() - i)

  const csv = () => q.data && downloadCsv(`ภาษีถูกหัก-ณ-ที่จ่าย-${year}.csv`, [
    ['วันที่', 'งานซ่อม', 'ผู้หักภาษี', 'เลขผู้เสียภาษีผู้หัก', 'เลขที่หนังสือรับรอง', 'อัตรา %', 'ยอดก่อนหัก', 'ภาษีที่ถูกหัก', 'สถานะ'],
    ...q.data.lines.map((l) => [day(l.date), l.ticketNumber ?? '', l.payerName, l.payerTaxId ?? '', l.certificateNo ?? '', l.ratePercent, l.baseAmount, l.amount,
      l.cancelled ? `ยกเลิก: ${l.cancelReason ?? ''}` : '']),
    ['', '', '', '', '', 'รวม', q.data.totals.baseAmount, q.data.totals.amount, ''],
  ])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="ปี"
          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900">
          {years.map((y) => <option key={y} value={y}>ปี {y}</option>)}
        </select>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={csv} disabled={!q.data?.lines.length}><Download className="mr-1.5 h-4 w-4" />Excel (CSV)</Button>
        </div>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-300">
        หนังสือรับรองการหักภาษี ณ ที่จ่าย (50 ทวิ) ที่ลูกค้าให้มาในปี {year} — ยอดนี้คือภาษีที่ร้านจ่ายล่วงหน้าไปแล้ว
        นำไปหักตอนยื่นภาษีเงินได้ประจำปี เก็บตัวหนังสือจริงไว้ทุกใบ
      </p>

      {q.isLoading && <p className="text-sm text-slate-500">กำลังโหลด...</p>}
      {q.error && <p className="text-sm text-red-600">โหลดรายงานไม่ได้</p>}

      {q.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs text-slate-500">ภาษีที่ถูกหักทั้งปี (ใช้หักภาษีได้)</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{m2(q.data.totals.amount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs text-slate-500">ยอดค่าบริการก่อนหัก</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{m2(q.data.totals.baseAmount)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <p className="text-xs text-slate-500">จำนวนหนังสือรับรอง</p>
              <p className="mt-1 text-2xl font-bold tabular-nums">{q.data.totals.certificates} ใบ</p>
            </div>
          </div>

          {q.data.lines.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500 dark:border-slate-700">
              ยังไม่มีรายการในปีนี้ — บันทึกได้ที่หน้างานซ่อมที่ส่งเครื่องแล้ว ปุ่ม “ลูกค้าหักภาษี ณ ที่จ่าย”
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-slate-50 text-left text-xs text-slate-500 dark:bg-slate-800/60">
                  <tr>
                    <th className="px-3 py-2">วันที่</th><th className="px-3 py-2">งานซ่อม</th><th className="px-3 py-2">ผู้หักภาษี</th>
                    <th className="px-3 py-2">เลขที่หนังสือ</th><th className="px-3 py-2 text-right">อัตรา</th>
                    <th className="px-3 py-2 text-right">ยอดก่อนหัก</th><th className="px-3 py-2 text-right">ภาษีที่ถูกหัก</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {q.data.lines.map((l) => (
                    <tr key={l.id} className={l.cancelled ? 'text-slate-400 line-through' : ''}>
                      <td className="px-3 py-2 whitespace-nowrap">{day(l.date)}</td>
                      <td className="px-3 py-2">{l.ticketNumber ? <Link href={`/repairs?open=${l.repairId}`} className="text-blue-600 hover:underline">{l.ticketNumber}</Link> : '—'}</td>
                      <td className="px-3 py-2">{l.payerName}{l.payerTaxId ? <span className="block text-xs text-slate-500">{l.payerTaxId}</span> : null}</td>
                      <td className="px-3 py-2">{l.certificateNo ?? '—'}{l.cancelled ? <span className="block text-xs no-underline">ยกเลิก: {l.cancelReason}</span> : null}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.ratePercent}%</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m2(l.baseAmount)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{m2(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold dark:bg-slate-800/60">
                  <tr>
                    <td className="px-3 py-2" colSpan={5}>รวม (ไม่นับที่ยกเลิก)</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m2(q.data.totals.baseAmount)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m2(q.data.totals.amount)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  )
}
