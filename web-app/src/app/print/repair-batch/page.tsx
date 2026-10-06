'use client'

export const dynamic = 'force-dynamic'

import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer, X } from 'lucide-react'
import api from '@/lib/api'
import { localDay, pickBatch, summarizeBatch, type BatchScope } from '@/lib/repair-batch'
import { buildRepairBatchThermalHtml } from '@/lib/printer'
import { thaiDay, useCustomerRepairs } from '@/components/repairs/repair-batch-print'
import type { ShopSettings } from '@/types'

type PW = '58mm' | '80mm'

/** Web print page for the combined dealer slip — prints the same HTML the apps send to the printer. */
export default function RepairBatchPrintPage() {
  const params     = useSearchParams()
  const customerId = params.get('customerId') ?? ''
  const [paper, setPaper] = useState<PW>((params.get('paper') as PW) || '80mm')
  const [day, setDay]     = useState(params.get('date') || localDay(new Date().toISOString()))
  const [kind, setKind]   = useState<BatchScope['kind']>(params.get('scope') === 'open' ? 'open' : 'date')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [frameH, setFrameH] = useState(600)

  const { data: repairs = [], isLoading, isError } = useCustomerRepairs(customerId)
  const { data: customer } = useQuery<{ id: string; name: string; phone?: string | null }>({
    queryKey: ['customers', customerId],
    queryFn:  async () => (await api.get(`/customers/${customerId}`)).data,
    enabled:  !!customerId,
    staleTime: 30_000,
  })
  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const scope: BatchScope = kind === 'open' ? { kind: 'open' } : { kind: 'date', date: day }
  const html = useMemo(() => {
    const summary = summarizeBatch(pickBatch(repairs, scope))
    return buildRepairBatchThermalHtml(summary, scope, customer ?? repairs[0]?.customer, settings, { paperWidth: paper })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repairs, customer, settings, paper, kind, day])

  // Days this customer brought devices in, newest first — to reprint an older intake
  const days = useMemo(() => Array.from(new Set(repairs.map((r) => localDay(r.receivedAt)))).sort().reverse(), [repairs])

  const px = paper === '80mm' ? 576 : 384
  const chip = (on: boolean) =>
    `rounded-lg px-3 py-1.5 text-sm font-semibold ${on ? 'bg-slate-800 text-white' : 'border bg-white text-gray-700 hover:bg-gray-50'}`

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-white px-4 py-2 shadow-sm">
        <span className="mr-auto text-sm font-semibold text-gray-700">ใบรวมงานซ่อม — {customer?.name ?? ''}</span>
        <button className={chip(kind === 'date')} onClick={() => setKind('date')}>ใบรับเครื่องรวม</button>
        {kind === 'date' && days.length > 0 && (
          <select value={day} onChange={(e) => setDay(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm">
            {!days.includes(day) && <option value={day}>{thaiDay(day)}</option>}
            {days.map((d) => <option key={d} value={d}>{thaiDay(d)}</option>)}
          </select>
        )}
        <button className={chip(kind === 'open')} onClick={() => setKind('open')}>งานค้างทั้งหมด</button>
        <span className="mx-1 h-6 w-px bg-gray-200" />
        {(['58mm', '80mm'] as const).map((w) => (
          <button key={w} className={chip(paper === w)} onClick={() => setPaper(w)}>{w}</button>
        ))}
        <button onClick={() => frameRef.current?.contentWindow?.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700">
          <Printer className="h-3.5 w-3.5" /> พิมพ์
        </button>
        <button onClick={() => window.close()}
          className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
          <X className="h-3.5 w-3.5" /> ปิด
        </button>
      </div>

      <div className="flex justify-center p-4">
        {!customerId ? (
          <p className="py-20 text-red-600">ไม่ได้ระบุลูกค้า</p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 py-20 text-gray-500"><Loader2 className="h-6 w-6 animate-spin" /> กำลังโหลด...</div>
        ) : isError ? (
          <p className="py-20 text-red-600">ไม่สามารถโหลดข้อมูลได้</p>
        ) : (
          <iframe
            ref={frameRef}
            title="ใบรวมงานซ่อม"
            srcDoc={html}
            onLoad={(e) => {
              const doc = (e.target as HTMLIFrameElement).contentDocument
              if (doc) setFrameH(doc.documentElement.scrollHeight + 8)
            }}
            style={{ width: px, height: frameH, border: 0, background: '#fff' }}
            className="shadow-md"
          />
        )}
      </div>
    </div>
  )
}
