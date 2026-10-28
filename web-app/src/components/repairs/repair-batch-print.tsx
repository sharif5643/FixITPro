'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, CheckCircle2, ClipboardList, Loader2, Printer, RotateCcw, X, XCircle } from 'lucide-react'
import api from '@/lib/api'
import { Platform } from '@/lib/platform'
import { localDay, pickBatch, summarizeBatch, type BatchRepair, type BatchScope } from '@/lib/repair-batch'
import { buildRepairBatchThermalHtml } from '@/lib/printer'
import { PrinterPickerStep, type PrinterInfo } from '@/components/sunmi/printer-flow'
import { pushBackHandler } from '@/lib/back-stack'
import type { ShopSettings } from '@/types'

/**
 * The combined slip for a dealer who brings several devices: one slip that lists every device of
 * the customer with its status, price, paid and owed. On the web it opens the print page; in the
 * apps it goes through the same printer flow as every other slip. Both print the same HTML.
 */

type Customer = { id: string; name?: string | null; phone?: string | null }

export function useCustomerRepairs(customerId: string | null | undefined) {
  return useQuery<BatchRepair[]>({
    queryKey: ['repairs', 'customer-batch', customerId],
    queryFn:  async () => {
      const res = await api.get('/repairs', { params: { customerId, limit: 100 } })
      return res.data?.data ?? res.data ?? []
    },
    enabled:  !!customerId,
    staleTime: 10_000,
  })
}

export function repairBatchPrintUrl(customerId: string, scope: BatchScope, paper?: '58mm' | '80mm') {
  const q = new URLSearchParams({ customerId })
  if (scope.kind === 'date') q.set('date', scope.date)
  else q.set('scope', 'open')
  if (paper) q.set('paper', paper)
  return `/print/repair-batch?${q.toString()}`
}

type CopyType = 'shop' | 'customer' | 'both'
type FlowState = 'pick-printer' | 'preview' | 'success' | 'error'

/**
 * App screens, the same steps and look as printing a single repair slip (RepairReceiptPrintFlow):
 * pick the printer (skipped when a default is saved), then one screen with which devices
 * (taken in that day / all open jobs), the shop's copy / the customer's / both, 58 / 80 mm and the
 * slip as it will print, then "พิมพ์สำเร็จ" or "ลองใหม่".
 */
export function RepairBatchPrintSheet({ customer, date, onClose }: {
  customer: Customer
  /** the intake day to start from (yyyy-MM-dd); defaults to today */
  date?: string
  onClose: () => void
}) {
  const day = date ?? localDay(new Date().toISOString())
  const { data: repairs = [], isLoading } = useCustomerRepairs(customer.id)
  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  const [state, setState]               = useState<FlowState>('pick-printer')
  const [printer, setPrinter]           = useState<PrinterInfo | null>(null)
  const [kind, setKind]                 = useState<BatchScope['kind'] | null>(null)
  const [selectedCopy, setSelectedCopy] = useState<CopyType>('both')
  const [paperPick, setPaperPick]       = useState<'58mm' | '80mm' | null>(null)
  const [printing, setPrinting]         = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')

  useEffect(() => pushBackHandler(onClose), [onClose])

  // A saved default printer skips the picker, as on the single repair slip
  useEffect(() => {
    let cancelled = false
    import('@/lib/sunmi-printer').then(async ({ SunmiPrinter }) => {
      try {
        const { printerId, printerName } = await SunmiPrinter.getDefaultPrinter()
        if (cancelled || !printerId || !printerName) return
        const { printers } = await SunmiPrinter.getAvailablePrinters()
        const found = printers.find((x) => x.id === printerId && x.available)
        if (found && !cancelled) { setPrinter(found); setState('preview') }
      } catch { /* stay on the picker */ }
    })
    return () => { cancelled = true }
  }, [])

  const dayCount  = useMemo(() => pickBatch(repairs, { kind: 'date', date: day }).length, [repairs, day])
  const openCount = useMemo(() => pickBatch(repairs, { kind: 'open' }).length, [repairs])
  // Start on the day's intake; when nothing came in that day, on the open jobs
  const scopeKind = kind ?? (dayCount > 0 || openCount === 0 ? 'date' : 'open')
  const scope: BatchScope = scopeKind === 'date' ? { kind: 'date', date: day } : { kind: 'open' }
  const paperWidth = paperPick ?? (((settings as { paperWidth?: string } | undefined)?.paperWidth as '58mm' | '80mm' | undefined) ?? '58mm')
  const count = scopeKind === 'date' ? dayCount : openCount

  const html = useMemo(
    () => buildRepairBatchThermalHtml(summarizeBatch(pickBatch(repairs, scope)), scope, customer, settings, { paperWidth, copyType: selectedCopy }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repairs, scopeKind, day, customer, settings, paperWidth, selectedCopy],
  )
  const title = scopeKind === 'date' ? 'พิมพ์ใบรับเครื่องรวม' : 'พิมพ์สรุปงานซ่อมค้าง'

  function handleSelectPrinter(p: PrinterInfo, saveAsDefault: boolean) {
    setPrinter(p)
    if (saveAsDefault) {
      import('@/lib/sunmi-printer').then(({ SunmiPrinter }) =>
        SunmiPrinter.setDefaultPrinter({ printerId: p.id, printerName: p.name }).catch(() => {}),
      )
    }
    setState('preview')
  }

  async function handlePrint() {
    if (!printer || count === 0) return
    setPrinting(true)
    try {
      const { SunmiPrinter } = await import('@/lib/sunmi-printer')
      const copyName = selectedCopy === 'both' ? '2 ฉบับ' : selectedCopy === 'shop' ? 'ใบร้าน' : 'ใบลูกค้า'
      const r = await SunmiPrinter.printHtml({ html, printerId: printer.id, jobName: `${scopeKind === 'date' ? 'ใบรับเครื่องรวม' : 'สรุปงานซ่อมค้าง'} (${copyName})` })
      if (!r.success) throw new Error(r.error ?? 'พิมพ์ไม่สำเร็จ')
      setState('success')
    } catch (e: unknown) {
      setErrorMsg((e as Error)?.message ?? 'เกิดข้อผิดพลาดในการพิมพ์')
      setState('error')
    } finally {
      setPrinting(false)
    }
  }

  const header = (onBack?: () => void) => (
    <div className="flex shrink-0 items-center gap-3 bg-blue-600 px-4 py-3 text-white"
      style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
      <button onClick={onBack ?? onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 active:bg-white/20">
        {onBack ? <ArrowLeft className="h-5 w-5" /> : <X className="h-5 w-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <p className="text-base font-bold leading-tight">{title}</p>
        <p className="truncate text-xs text-blue-200">
          {printer && state === 'preview' ? printer.name : `${customer.name ?? ''}${customer.phone ? ` · ${customer.phone}` : ''}`}
        </p>
      </div>
      {onBack && (
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 active:bg-white/20">
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  )

  const choice = (on: boolean) => `transition-colors ${on ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-700'}`

  let content: React.ReactNode
  if (state === 'pick-printer') {
    content = (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {header()}
        <div className="min-h-0 flex-1">
          <PrinterPickerStep onSelect={handleSelectPrinter} onClose={onClose} />
        </div>
      </div>
    )
  } else if (state === 'success') {
    content = (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white px-8">
        <CheckCircle2 className="h-20 w-20 text-emerald-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-slate-900">พิมพ์สำเร็จ!</p>
          <p className="mt-1 text-sm text-slate-500">ส่งงานพิมพ์ไปยัง {printer?.name}</p>
        </div>
        <button onClick={onClose}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700">
          <X className="h-4 w-4" /> ปิด
        </button>
      </div>
    )
  } else if (state === 'error') {
    content = (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-white px-8">
        <XCircle className="h-20 w-20 text-red-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-slate-900">พิมพ์ไม่สำเร็จ</p>
          <p className="mt-2 text-sm text-red-500">{errorMsg}</p>
        </div>
        <div className="w-full space-y-2">
          <button onClick={() => { setErrorMsg(''); setState('preview') }}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-sm font-bold text-white">
            <RotateCcw className="h-4 w-4" /> ลองใหม่
          </button>
          <button onClick={onClose}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 text-sm font-medium text-slate-700">
            ปิด
          </button>
        </div>
      </div>
    )
  } else {
    content = (
      <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {header(() => setState('pick-printer'))}

        <div className="shrink-0 space-y-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          {/* Which devices: the day's intake, or every job still open */}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setKind('date')} disabled={dayCount === 0}
              className={`h-12 rounded-2xl text-sm font-semibold leading-tight disabled:opacity-40 ${choice(scopeKind === 'date')}`}>
              รับวันที่ {thaiDay(day)}<span className="block text-[11px] font-normal opacity-80">{dayCount} เครื่อง</span>
            </button>
            <button onClick={() => setKind('open')} disabled={openCount === 0}
              className={`h-12 rounded-2xl text-sm font-semibold leading-tight disabled:opacity-40 ${choice(scopeKind === 'open')}`}>
              งานค้างทั้งหมด<span className="block text-[11px] font-normal opacity-80">{openCount} เครื่อง</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSelectedCopy('shop')}
              className={`flex h-12 items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold ${choice(selectedCopy === 'shop')}`}>
              <span>📄</span> พิมพ์ของร้าน
            </button>
            <button onClick={() => setSelectedCopy('customer')}
              className={`flex h-12 items-center justify-center gap-1.5 rounded-2xl text-sm font-semibold ${choice(selectedCopy === 'customer')}`}>
              <span>👤</span> พิมพ์ลูกค้า
            </button>
          </div>
          <button onClick={() => setSelectedCopy('both')}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-sm font-semibold transition-colors ${
              selectedCopy === 'both'
                ? 'bg-[rgb(var(--brand-accent))] text-[rgb(var(--brand-accent-fg))]'
                : 'border border-slate-200 bg-white text-slate-700'
            }`}>
            <span>✨</span> พิมพ์ 2 ฉบับ (ร้าน + ลูกค้า)
          </button>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-xs text-slate-500">กระดาษ:</span>
            <div className="flex flex-1 gap-1">
              {(['58mm', '80mm'] as const).map((w) => (
                <button key={w} onClick={() => setPaperPick(w)}
                  className={`h-8 flex-1 rounded-xl text-xs font-semibold transition-colors ${
                    paperWidth === w ? 'bg-slate-700 text-white' : 'border border-slate-200 bg-white text-slate-600'
                  }`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* The slip as it will print */}
        <div className="flex-1 overflow-y-auto bg-gray-100 py-4">
          {isLoading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : count === 0 ? (
            <p className="py-16 text-center text-sm text-slate-500">ไม่มีเครื่องในใบนี้</p>
          ) : (
            <SlipPreview html={html} paperWidth={paperWidth} />
          )}
        </div>

        <div className="shrink-0 px-4 pt-3" style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}>
          <button onClick={handlePrint} disabled={printing || isLoading || count === 0}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 text-base font-bold text-white active:bg-blue-700 disabled:opacity-60">
            {printing
              ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Printer className="h-5 w-5" />}
            {printing ? 'กำลังพิมพ์...' : 'พิมพ์'}
          </button>
        </div>
      </div>
    )
  }

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

/** The printer's HTML on a white paper strip in the middle, as tall as the slip (no inner scroll) */
function SlipPreview({ html, paperWidth }: { html: string; paperWidth: '58mm' | '80mm' }) {
  const [height, setHeight] = useState(600)
  const width = paperWidth === '80mm' ? 302 : 220
  const px    = paperWidth === '80mm' ? 576 : 384
  const doc   = html.replace('</head>', `<style>html{zoom:${(width / px).toFixed(4)}}body{margin:0 auto}</style></head>`)
  return (
    <div className="mx-auto bg-white shadow-md" style={{ width }}>
      <iframe title="ตัวอย่างใบรวม" srcDoc={doc} style={{ width, height, border: 'none', display: 'block' }}
        onLoad={(e) => {
          const d = e.currentTarget.contentDocument
          if (d) setHeight(Math.ceil(d.documentElement.getBoundingClientRect().height) + 8)
        }} />
    </div>
  )
}

export function thaiDay(day: string): string {
  try { return format(new Date(`${day}T00:00:00`), 'dd MMM yyyy', { locale: th }) }
  catch { return day }
}

/**
 * "พิมพ์ใบรวม" — opens the print page on the web, or the printer flow in the apps. Shown only when
 * the customer has more than one job, since a single device already has its own slip.
 */
export function RepairBatchButton({ customer, date, className, always, label }: {
  customer: Customer | null | undefined
  date?: string
  className?: string
  label?: string
  /** show even when the customer has a single job */
  always?: boolean
}) {
  const [open, setOpen] = useState(false)
  const { data: repairs = [] } = useCustomerRepairs(customer?.id)
  const day   = date ?? localDay(new Date().toISOString())
  const worth = pickBatch(repairs, { kind: 'date', date: day }).length >= 2 || pickBatch(repairs, { kind: 'open' }).length >= 2
  if (!customer?.id || (!always && !worth)) return null

  function handleClick() {
    if (Platform.isNative()) { setOpen(true); return }
    window.open(repairBatchPrintUrl(customer!.id, { kind: 'date', date: day }), '_blank')
  }

  return (
    <>
      <button type="button" onClick={handleClick}
        className={className ?? 'flex w-full items-center justify-center gap-2 rounded-xl border-2 border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-100 active:bg-blue-100'}>
        <ClipboardList className="h-4 w-4" />
        {label ?? 'พิมพ์ใบรวมของลูกค้านี้'}
      </button>
      {open && <RepairBatchPrintSheet customer={customer} date={date} onClose={() => setOpen(false)} />}
    </>
  )
}
