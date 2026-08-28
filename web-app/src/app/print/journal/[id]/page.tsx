'use client'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface JournalLine {
  id:          string
  accountCode: string
  account:     { code: string; nameTh: string; name: string }
  debit:       string | number
  credit:      string | number
  note?:       string | null
  sortOrder:   number
}

interface JournalEntry {
  id:          string
  entryNumber: string
  entryDate:   string
  description: string
  sourceType:  string | null
  isVoided:    boolean
  voidReason?: string | null
  voidedAt?:  string | null
  postedBy?:   { name: string } | null
  createdAt:   string
  totalDebit:  string | number
  totalCredit: string | number
  lines:       JournalLine[]
}

// ── Source label map ──────────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  REPAIR_DEPOSIT:            'มัดจำงานซ่อม',
  REPAIR_FINAL_PAYMENT:      'รับเงินค่าซ่อม',
  REPAIR_DEPOSIT_SETTLE:     'หักมัดจำ',
  REPAIR_DEPOSIT_REFUND:     'คืนมัดจำ',
  REPAIR_COGS:               'ต้นทุนซ่อม',
  REPAIR_PAYMENT_REVERSAL:   'ยกเลิกรับเงินซ่อม',
  REPAIR_COGS_REVERSAL:      'ยกเลิกต้นทุนซ่อม',
  EXPENSE_PAYMENT:           'ค่าใช้จ่าย',
  EXPENSE_REVERSAL:          'ยกเลิกค่าใช้จ่าย',
  SALE_REVENUE:              'รายได้ขาย POS',
  SALE_COGS:                 'ต้นทุนขาย POS',
  SALE_EXCHANGE:             'แลกสินค้า',
  JOURNAL_MANUAL:            'บันทึกรายการทั่วไป',
  JOURNAL_REVERSAL:          'กลับรายการ',
}

// ── Format helpers ────────────────────────────────────────────────────────────

function fmt(n: string | number | undefined | null): string {
  const v = Number(n ?? 0)
  if (v === 0) return '—'
  return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtTotal(n: string | number | undefined | null): string {
  const v = Number(n ?? 0)
  return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function JournalPrintPage() {
  const { id }         = useParams<{ id: string }>()
  const autoPrintFired = useRef(false)

  const { data: entry, isLoading, isError } = useQuery<JournalEntry>({
    queryKey: ['journal-print', id],
    queryFn:  () => api.get(`/accounting/journals/${id}`).then(r => r.data),
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

  // Auto-print when data arrives
  useEffect(() => {
    if (!entry || autoPrintFired.current) return
    autoPrintFired.current = true
    const t = setTimeout(() => window.print(), 600)
    return () => clearTimeout(t)
  }, [entry])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen gap-2 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }
  if (isError || !entry) {
    return (
      <div className="flex items-center justify-center h-screen text-red-600">
        ไม่พบรายการบัญชีนี้
      </div>
    )
  }

  const shopName    = settings?.shopName    ?? 'FixITPro'
  const shopAddress = settings?.shopAddress ?? ''
  const shopPhone   = settings?.shopPhone   ?? ''
  const totalDebit  = Number(entry.totalDebit ?? 0)
  const balanced    = Math.abs(totalDebit - Number(entry.totalCredit ?? 0)) < 0.005

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">

      {/* ── Action bar (no-print) ─────────────────────────────────────── */}
      <div className="no-print fixed top-0 inset-x-0 bg-slate-800 text-white flex items-center justify-between px-6 py-3 z-50 shadow">
        <span className="text-sm font-medium">พิมพ์รายการบัญชี {entry.entryNumber}</span>
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
            บัญชีกรรณีกา (Journal Entry)
          </h2>
        </div>

        {/* Entry metadata */}
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 mb-6 text-sm">
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">เลขที่รายการ:</span>
            <span className="font-mono">{entry.entryNumber}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">วันที่:</span>
            <span>{format(new Date(entry.entryDate), 'dd MMMM yyyy', { locale: th })}</span>
          </div>
          <div className="flex gap-2 col-span-2">
            <span className="font-semibold w-28 shrink-0">คำอธิบาย:</span>
            <span>{entry.description}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">ประเภท:</span>
            <span>{SOURCE_LABEL[entry.sourceType ?? ''] ?? entry.sourceType ?? 'อื่นๆ'}</span>
          </div>
          <div className="flex gap-2">
            <span className="font-semibold w-28 shrink-0">ผู้บันทึก:</span>
            <span>{entry.postedBy?.name ?? '—'}</span>
          </div>
          {entry.isVoided && (
            <div className="flex gap-2 col-span-2">
              <span className="font-semibold w-28 shrink-0 text-red-600">สถานะ:</span>
              <span className="text-red-600 font-semibold">
                ยกเลิกแล้ว — {entry.voidReason}
                {entry.voidedAt ? ` (${format(new Date(entry.voidedAt), 'dd/MM/yyyy')})` : ''}
              </span>
            </div>
          )}
        </div>

        {/* Lines table */}
        <table className="w-full text-sm border-collapse mb-6">
          <thead>
            <tr className="border-b-2 border-slate-900">
              <th className="text-left py-2 pr-3 w-8 font-semibold">#</th>
              <th className="text-left py-2 pr-3 w-20 font-semibold">รหัสบัญชี</th>
              <th className="text-left py-2 pr-3 font-semibold">ชื่อบัญชี</th>
              <th className="text-right py-2 pr-3 w-32 font-semibold">เดบิต (Dr)</th>
              <th className="text-right py-2 w-32 font-semibold">เครดิต (Cr)</th>
            </tr>
          </thead>
          <tbody>
            {entry.lines.map((line, idx) => (
              <tr key={line.id} className="border-b border-slate-200">
                <td className="py-2 pr-3 text-slate-400">{idx + 1}</td>
                <td className="py-2 pr-3 font-mono text-slate-600">{line.account.code}</td>
                <td className="py-2 pr-3">
                  <span>{line.account.nameTh || line.account.name}</span>
                  {line.note && (
                    <span className="block text-xs text-slate-400 italic mt-0.5">หมายเหตุ: {line.note}</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  {fmt(line.debit)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {fmt(line.credit)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-900">
              <td colSpan={3} className="py-2.5 pr-3 font-bold text-right">รวม</td>
              <td className="py-2.5 pr-3 text-right tabular-nums font-bold">{fmtTotal(entry.totalDebit)}</td>
              <td className="py-2.5 text-right tabular-nums font-bold">{fmtTotal(entry.totalCredit)}</td>
            </tr>
            <tr>
              <td colSpan={5} className="pt-1 text-right text-xs">
                {balanced
                  ? <span className="text-slate-500">✓ รายการสมดุล</span>
                  : <span className="text-red-600">⚠ รายการไม่สมดุล</span>
                }
              </td>
            </tr>
          </tfoot>
        </table>

        {/* Signature section */}
        <div className="grid grid-cols-3 gap-4 mt-12 pt-4 text-xs text-center text-slate-500">
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้จัดทำ</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้ตรวจสอบ</div>
          </div>
          <div>
            <div className="border-t border-slate-400 pt-2 mt-8">ผู้อนุมัติ</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 flex justify-between">
          <span>พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}</span>
          <span>{entry.entryNumber}</span>
        </div>
      </div>
    </div>
  )
}
