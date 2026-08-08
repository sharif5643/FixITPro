'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Printer, CheckCircle2, XCircle, RotateCcw, X } from 'lucide-react'
import { RepairDeliveryReceipt } from '@/components/receipt/repair-delivery-receipt'
import { PrinterPickerStep, type PrinterInfo } from '@/components/sunmi/printer-flow'
import { pushBackHandler } from '@/lib/back-stack'
import api from '@/lib/api'
import type { Repair, ShopSettings } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

type CopyType  = 'shop' | 'customer' | 'both'
type FlowState = 'pick-printer' | 'preview' | 'success' | 'error'

interface Props {
  repairId:         string
  onClose:          () => void
  successNavItems?: { label: string; href: string }[]
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RepairDeliveryPrintFlow({ repairId, onClose, successNavItems }: Props) {
  const [state, setState]               = useState<FlowState>('pick-printer')
  const [printer, setPrinter]           = useState<PrinterInfo | null>(null)
  const [selectedCopy, setSelectedCopy] = useState<CopyType>('both')
  const [printing, setPrinting]         = useState(false)
  const [errorMsg, setErrorMsg]         = useState('')

  useEffect(() => pushBackHandler(onClose), [onClose])

  const { data: repair, isLoading } = useQuery<Repair>({
    queryKey: ['staff-repair', repairId],
    queryFn:  async () => (await api.get(`/repairs/${repairId}`)).data,
    staleTime: 300_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

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
    if (!printer || !repair) return
    setPrinting(true)
    try {
      const [{ SunmiPrinter }, { buildRepairDeliveryReceiptThermalHtml }] = await Promise.all([
        import('@/lib/sunmi-printer'),
        import('@/lib/printer'),
      ])

      if (selectedCopy === 'shop' || selectedCopy === 'both') {
        const html = buildRepairDeliveryReceiptThermalHtml(repair, settings, { copyType: 'shop' })
        const r = await SunmiPrinter.printHtml({ html, printerId: printer.id, jobName: 'ใบเสร็จ (ใบร้าน)' })
        if (!r.success) throw new Error(r.error ?? 'พิมพ์ใบร้านไม่สำเร็จ')
      }

      if (selectedCopy === 'customer' || selectedCopy === 'both') {
        const html = buildRepairDeliveryReceiptThermalHtml(repair, settings, { copyType: 'customer' })
        const r = await SunmiPrinter.printHtml({ html, printerId: printer.id, jobName: 'ใบเสร็จ (ใบลูกค้า)' })
        if (!r.success) throw new Error(r.error ?? 'พิมพ์ใบลูกค้าไม่สำเร็จ')
      }

      setState('success')
    } catch (e: unknown) {
      setErrorMsg((e as Error)?.message ?? 'เกิดข้อผิดพลาดในการพิมพ์')
      setState('error')
    } finally {
      setPrinting(false)
    }
  }

  function handlePrintA4() {
    window.open(`/print/delivery/${repairId}?paper=A4`, '_blank')
  }

  // ── Header ───────────────────────────────────────────────────────────────────

  function Header({ onBack }: { onBack?: () => void }) {
    return (
      <div
        className="bg-emerald-600 text-white px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}
      >
        {onBack ? (
          <button
            onClick={onBack}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 active:bg-white/20"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 active:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-base leading-tight">พิมพ์ใบเสร็จรับเงิน</p>
          {printer && state === 'preview' && (
            <p className="text-xs text-emerald-200 truncate">{printer.name}</p>
          )}
        </div>
        {onBack && (
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 active:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>
    )
  }

  // ── Pick printer ──────────────────────────────────────────────────────────────

  if (state === 'pick-printer') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col">
        <Header />
        <div className="flex-1 min-h-0">
          <PrinterPickerStep onSelect={handleSelectPrinter} onClose={onClose} />
        </div>
      </div>
    )
  }

  // ── Success ───────────────────────────────────────────────────────────────────

  if (state === 'success') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-6 px-8">
        <CheckCircle2 className="h-20 w-20 text-emerald-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-slate-900">พิมพ์สำเร็จ!</p>
          <p className="text-sm text-slate-500 mt-1">ส่งงานพิมพ์ไปยัง {printer?.name}</p>
        </div>
        <div className="w-full space-y-2">
          {successNavItems?.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="flex items-center justify-center w-full h-12 rounded-2xl bg-[#FFC107] text-[#111] font-bold text-sm"
            >
              {item.label}
            </a>
          ))}
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl border border-slate-200 text-slate-700 font-medium text-sm"
          >
            <X className="h-4 w-4" /> ปิด
          </button>
        </div>
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────────

  if (state === 'error') {
    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center gap-6 px-8">
        <XCircle className="h-20 w-20 text-red-500" />
        <div className="text-center">
          <p className="text-xl font-bold text-slate-900">พิมพ์ไม่สำเร็จ</p>
          <p className="text-sm text-red-500 mt-2">{errorMsg}</p>
        </div>
        <div className="w-full space-y-2">
          <button
            onClick={() => { setErrorMsg(''); setState('preview') }}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-emerald-600 text-white font-bold text-sm"
          >
            <RotateCcw className="h-4 w-4" /> ลองใหม่
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl border border-slate-200 text-slate-700 font-medium text-sm"
          >
            ปิด
          </button>
        </div>
      </div>
    )
  }

  // ── Preview ───────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      <Header onBack={() => setState('pick-printer')} />

      {/* Copy type buttons */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 shrink-0 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setSelectedCopy('shop')}
            className={`h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors ${
              selectedCopy === 'shop'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            <span>📄</span> ฉบับร้าน
          </button>
          <button
            onClick={() => setSelectedCopy('customer')}
            className={`h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-1.5 transition-colors ${
              selectedCopy === 'customer'
                ? 'bg-emerald-600 text-white'
                : 'bg-white border border-slate-200 text-slate-700'
            }`}
          >
            <span>👤</span> ฉบับลูกค้า
          </button>
        </div>
        <button
          onClick={() => setSelectedCopy('both')}
          className={`w-full h-12 rounded-2xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors ${
            selectedCopy === 'both'
              ? 'bg-[#FFC107] text-[#111]'
              : 'bg-white border border-slate-200 text-slate-700'
          }`}
        >
          <span>✨</span> พิมพ์ 2 ฉบับ (ร้าน + ลูกค้า)
        </button>
      </div>

      {/* Receipt preview */}
      <div className="flex-1 overflow-y-auto bg-gray-100 py-4">
        {isLoading || !repair ? (
          <div className="flex items-center justify-center h-full">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-600 border-t-transparent" />
          </div>
        ) : (
          <div className="mx-auto w-fit bg-white shadow-md">
            {(selectedCopy === 'shop' || selectedCopy === 'both') && (
              <div className="px-2 pt-2">
                <RepairDeliveryReceipt repair={repair} paperWidth="58mm" settings={settings} copyType="shop" />
              </div>
            )}

            {selectedCopy === 'both' && (
              <div className="flex items-center gap-2 px-4 py-3 border-t-2 border-b-2 border-dashed border-gray-300">
                <div className="flex-1 h-0 border-t border-dashed border-gray-300" />
                <span className="text-xs text-gray-400 shrink-0">✂ ฉีกตรงนี้</span>
                <div className="flex-1 h-0 border-t border-dashed border-gray-300" />
              </div>
            )}

            {(selectedCopy === 'customer' || selectedCopy === 'both') && (
              <div className="px-2 pb-2">
                <RepairDeliveryReceipt repair={repair} paperWidth="58mm" settings={settings} copyType="customer" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div
        className="px-4 pt-3 shrink-0 grid grid-cols-2 gap-2"
        style={{ paddingBottom: 'calc(16px + env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handlePrintA4}
          className="h-14 rounded-2xl border border-slate-200 bg-white font-semibold text-sm text-slate-700 flex items-center justify-center gap-2 active:bg-slate-50"
        >
          <Printer className="h-4 w-4" />
          พิมพ์ A4
        </button>
        <button
          onClick={handlePrint}
          disabled={printing || isLoading}
          className="h-14 rounded-2xl bg-emerald-600 text-white font-bold text-base flex items-center justify-center gap-2 active:bg-emerald-700 disabled:opacity-60"
        >
          {printing ? (
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
          ) : (
            <Printer className="h-5 w-5" />
          )}
          {printing ? 'กำลังพิมพ์...' : 'พิมพ์'}
        </button>
      </div>
    </div>
  )
}
