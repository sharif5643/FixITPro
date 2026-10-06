'use client'

import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, ClipboardList, Loader2, X } from 'lucide-react'
import api from '@/lib/api'
import { Platform } from '@/lib/platform'
import { localDay, pickBatch, summarizeBatch, type BatchRepair, type BatchScope } from '@/lib/repair-batch'
import { buildRepairBatchPreviewData, buildRepairBatchThermalHtml } from '@/lib/printer'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
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

/** App screens: pick which devices go on the slip, then print through the printer flow. */
export function RepairBatchPrintSheet({ customer, date, onClose }: {
  customer: Customer
  /** the intake day to start from (yyyy-MM-dd); defaults to today */
  date?: string
  onClose: () => void
}) {
  const day = date ?? localDay(new Date().toISOString())
  const [scope, setScope] = useState<BatchScope | null>(null)
  const { data: repairs = [], isLoading } = useCustomerRepairs(customer.id)
  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })
  const paperWidth = ((settings as any)?.paperWidth as '58mm' | '80mm' | undefined) ?? '58mm'

  const dayCount  = useMemo(() => pickBatch(repairs, { kind: 'date', date: day }).length, [repairs, day])
  const openCount = useMemo(() => pickBatch(repairs, { kind: 'open' }).length, [repairs])

  const content = scope ? (() => {
    const summary = summarizeBatch(pickBatch(repairs, scope))
    return (
      <PrinterFlowSheet
        receiptHtml={buildRepairBatchThermalHtml(summary, scope, customer, settings, { paperWidth })}
        previewData={buildRepairBatchPreviewData(summary, scope, customer, settings)}
        jobName={scope.kind === 'date' ? 'ใบรับเครื่องรวม' : 'สรุปงานซ่อมค้าง'}
        onClose={onClose}
      />
    )
  })() : (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex items-center gap-3 bg-blue-600 px-4 py-3 text-white"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <button onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 active:bg-white/20">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-tight">พิมพ์ใบรวม</p>
          <p className="truncate text-xs text-blue-200">{customer.name}{customer.phone ? ` · ${customer.phone}` : ''}</p>
        </div>
      </div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        ) : (
          <>
            <ScopeButton
              title="ใบรับเครื่องรวม"
              detail={`เครื่องที่รับวันที่ ${thaiDay(day)} — ${dayCount} เครื่อง`}
              disabled={dayCount === 0}
              onClick={() => setScope({ kind: 'date', date: day })}
            />
            <ScopeButton
              title="สรุปงานซ่อมค้าง"
              detail={`ทุกเครื่องที่ยังไม่ส่งคืนหรือยังค้างจ่าย — ${openCount} เครื่อง`}
              disabled={openCount === 0}
              onClick={() => setScope({ kind: 'open' })}
            />
            <p className="px-1 text-xs text-slate-500">
              ใบรวมบอกสถานะ ราคา ยอดที่จ่ายแล้ว และยอดค้างของแต่ละเครื่อง พิมพ์ซ้ำได้ทุกครั้งที่ลูกค้ามารับเครื่อง
            </p>
          </>
        )}
      </div>
    </div>
  )

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content
}

export function thaiDay(day: string): string {
  try { return format(new Date(`${day}T00:00:00`), 'dd MMM yyyy', { locale: th }) }
  catch { return day }
}

function ScopeButton({ title, detail, disabled, onClick }: { title: string; detail: string; disabled: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left active:bg-slate-50 disabled:opacity-40">
      <ClipboardList className="h-6 w-6 shrink-0 text-blue-600" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="text-xs text-slate-500">{detail}</p>
      </div>
      <ArrowLeft className="h-4 w-4 rotate-180 text-slate-400" />
    </button>
  )
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
