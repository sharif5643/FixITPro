'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Printer, Bluetooth, CheckCircle2, XCircle, ChevronRight,
  Share2, Settings, RotateCcw, Home, ArrowLeft, Wifi,
} from 'lucide-react'
import { Platform } from '@/lib/platform'
import { pushBackHandler } from '@/lib/back-stack'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ThermalLine =
  | { type: 'header'; text: string }
  | { type: 'subheader'; text: string }
  | { type: 'row'; label: string; value: string; bold?: boolean }
  | { type: 'item'; name: string; detail: string; total: string }
  | { type: 'separator' }
  | { type: 'center'; text: string; small?: boolean }

export interface ThermalPreviewData {
  title:      string        // e.g. "ใบเสร็จรับเงิน"
  number:     string        // e.g. "RC-0001"
  shopName?:  string
  shopPhone?: string
  date?:      string
  footer?:    string
  lines:      ThermalLine[]
}

interface PrinterInfo {
  id:        string
  name:      string
  type:      'inner' | 'bluetooth'
  available: boolean
  address?:  string
}

export interface PrinterFlowSheetProps {
  receiptHtml:      string            // actual HTML to send to printer
  jobName:          string
  previewData:      ThermalPreviewData
  onShare?:         () => Promise<void>  // optional share button (LINE/WhatsApp)
  onClose:          () => void
  successNavItems?: { label: string; href: string }[]
  /** When true + default printer is saved, skip preview and print immediately (one-tap) */
  autoPrint?:       boolean
}

// ── State machine ─────────────────────────────────────────────────────────────

type FlowState = 'pick-printer' | 'preview' | 'auto-printing' | 'printing' | 'success' | 'error'

// ── Thermal receipt preview ───────────────────────────────────────────────────
// Full-width paper strip — same font sizes and spacing as the printed HTML so the
// preview matches the real receipt 1:1. No card, no shadow, no centering.

// Font sizes mirror THERMAL_CSS exactly (px units, 384px target width).
// On a phone the container is ~360-390px wide — close enough for a faithful preview.
const P = {
  base:  24,  // body
  xl:    34,  // shop name
  lg:    28,  // receipt title
  sm:    20,  // small detail
  xs:    18,  // extra-small
  total: 30,  // grand total
  item:  20,  // item sub-line
} as const

function ThermalReceiptCard({ data }: { data: ThermalPreviewData }) {
  return (
    <div style={{
      fontFamily: "'Courier New', Courier, monospace",
      fontSize:   P.base,
      lineHeight: 1.4,
      color:      '#000',
      background: '#fff',
      width:      '100%',
      padding:    '8px 12px 16px 12px',
    }}>
      {/* Shop name */}
      {data.shopName && (
        <p style={{ textAlign: 'center', fontSize: P.xl, fontWeight: 'bold', marginBottom: 2 }}>
          {data.shopName}
        </p>
      )}
      {data.shopPhone && (
        <p style={{ textAlign: 'center', fontSize: P.xs, marginBottom: 2 }}>
          โทร: {data.shopPhone}
        </p>
      )}

      {(data.shopName || data.shopPhone) && <DashLine />}

      {/* Receipt title + number + date */}
      <p style={{ textAlign: 'center', fontSize: P.lg, fontWeight: 'bold', marginBottom: 2 }}>
        {data.title}
      </p>
      <p style={{ textAlign: 'center', fontSize: P.sm, marginBottom: 2 }}>#{data.number}</p>
      {data.date && (
        <p style={{ textAlign: 'center', fontSize: P.xs, marginBottom: 2 }}>{data.date}</p>
      )}

      {/* Body lines */}
      {data.lines.map((line, i) => {
        if (line.type === 'separator') return <DashLine key={i} />

        if (line.type === 'header')
          return (
            <p key={i} style={{ textAlign: 'center', fontSize: P.lg, fontWeight: 'bold', marginTop: 4 }}>
              {line.text}
            </p>
          )

        if (line.type === 'subheader')
          return (
            <p key={i} style={{ textAlign: 'center', fontSize: P.sm }}>{line.text}</p>
          )

        if (line.type === 'center')
          return (
            <p key={i} style={{ textAlign: 'center', fontSize: line.small ? P.xs : P.sm }}>
              {line.text}
            </p>
          )

        if (line.type === 'item')
          return (
            <div key={i} style={{ marginBottom: 4 }}>
              <p style={{ fontSize: P.base, wordBreak: 'break-word' }}>{line.name}</p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: P.item }}>
                <span style={{ color: '#444' }}>{line.detail}</span>
                <span style={{ whiteSpace: 'nowrap' }}>{line.total}</span>
              </div>
            </div>
          )

        if (line.type === 'row') {
          const bold = line.bold ?? false
          return (
            <div key={i} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
              fontSize: bold ? P.total : P.base,
              fontWeight: bold ? 'bold' : 'normal',
              marginBottom: 3,
            }}>
              <span>{line.label}</span>
              <span style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>{line.value}</span>
            </div>
          )
        }

        return null
      })}

      {/* Footer */}
      {data.footer && (
        <>
          <DashLine />
          <p style={{ textAlign: 'center', fontSize: P.xs, paddingBottom: 8 }}>{data.footer}</p>
        </>
      )}
    </div>
  )
}

function DashLine() {
  return <div style={{ borderTop: '2px dashed #000', margin: '8px 0' }} />
}

// ── Printer picker step ───────────────────────────────────────────────────────

interface PrinterPickerProps {
  onSelect:   (printer: PrinterInfo, saveAsDefault: boolean) => void
  onClose:    () => void
}

function PrinterPickerStep({ onSelect, onClose }: PrinterPickerProps) {
  const [printers, setPrinters]           = useState<PrinterInfo[]>([])
  const [loading, setLoading]             = useState(true)
  const [selected, setSelected]           = useState<PrinterInfo | null>(null)
  const [saveDefault, setSaveDefault]     = useState(false)
  const [defaultId, setDefaultId]         = useState('')
  const [permissionDenied, setPermissionDenied] = useState(false)
  const [btDisabled, setBtDisabled]       = useState(false)
  const [requestingPerm, setRequestingPerm] = useState(false)

  async function load() {
    setLoading(true)
    setPermissionDenied(false)
    setBtDisabled(false)
    try {
      const { SunmiPrinter } = await import('@/lib/sunmi-printer')
      const [printerRes, { printerId }] = await Promise.all([
        SunmiPrinter.getAvailablePrinters(),
        SunmiPrinter.getDefaultPrinter(),
      ])
      if (printerRes.permissionDenied) { setPermissionDenied(true); return }
      if (printerRes.bluetoothDisabled) { setBtDisabled(true); return }
      setPrinters(printerRes.printers)
      setDefaultId(printerId)
      if (printerId) {
        const found = printerRes.printers.find((p) => p.id === printerId)
        if (found) setSelected(found)
      }
    } catch {
      // Native calls can fail in browser; leave list empty
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function openBluetoothSettings() {
    try {
      const { SunmiPrinter } = await import('@/lib/sunmi-printer')
      await SunmiPrinter.openBluetoothSettings()
    } catch {
      // Not available on web
    }
  }

  async function handleRequestPermission() {
    setRequestingPerm(true)
    try {
      const { SunmiPrinter } = await import('@/lib/sunmi-printer')
      const result = await SunmiPrinter.requestPermissions()
      if (result.bluetoothConnect === 'granted') {
        await load()
      } else {
        setPermissionDenied(true)
      }
    } catch {
      setPermissionDenied(true)
    } finally {
      setRequestingPerm(false)
    }
  }

  const canProceed = selected !== null && selected.available

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 pb-3 shrink-0">
        <p className="font-bold text-lg text-slate-900">เลือกเครื่องพิมพ์</p>
        <p className="text-xs text-slate-400 mt-0.5">เลือกเครื่องพิมพ์ที่ต้องการใช้งาน</p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 space-y-2 pb-2">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 bg-slate-100 rounded-2xl animate-pulse" />
          ))
        ) : permissionDenied ? (
          <div className="flex flex-col items-center py-8 gap-4 text-slate-400 px-2">
            <Bluetooth className="h-10 w-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">ยังไม่ได้อนุญาตให้ใช้ Bluetooth</p>
              <p className="text-xs mt-1 text-slate-400">กรุณาอนุญาตให้แอปใช้ Bluetooth เพื่อเชื่อมต่อเครื่องพิมพ์</p>
            </div>
            <button
              onClick={handleRequestPermission}
              disabled={requestingPerm}
              className="w-full h-12 rounded-2xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-60"
            >
              {requestingPerm ? 'กำลังขออนุญาต...' : 'อนุญาตให้ใช้ Bluetooth'}
            </button>
          </div>
        ) : btDisabled ? (
          <div className="flex flex-col items-center py-8 gap-4 text-slate-400 px-2">
            <Bluetooth className="h-10 w-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">กรุณาเปิด Bluetooth</p>
              <p className="text-xs mt-1 text-slate-400">เปิด Bluetooth เพื่อค้นหาเครื่องพิมพ์ที่จับคู่ไว้</p>
            </div>
            <button
              onClick={async () => { await openBluetoothSettings(); await load() }}
              className="w-full h-12 rounded-2xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700"
            >
              เปิดการตั้งค่า Bluetooth
            </button>
          </div>
        ) : printers.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-3 px-2">
            <Bluetooth className="h-10 w-10 opacity-30" />
            <div className="text-center">
              <p className="text-sm font-semibold text-slate-600">ไม่พบเครื่องพิมพ์ที่จับคู่ไว้</p>
              <p className="text-xs mt-1 text-slate-400">
                กรุณาจับคู่เครื่องพิมพ์จากการตั้งค่า Bluetooth ของ Android ก่อน
              </p>
            </div>
            <button
              onClick={openBluetoothSettings}
              className="w-full h-12 rounded-2xl bg-slate-800 text-white font-semibold text-sm active:bg-slate-700"
            >
              เปิดการตั้งค่า Bluetooth เพื่อจับคู่
            </button>
          </div>
        ) : (
          printers.map((p) => {
            const isSelected = selected?.id === p.id
            const isDefault  = p.id === defaultId
            return (
              <button
                key={p.id}
                disabled={!p.available}
                onClick={() => setSelected(p)}
                className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 text-left transition-colors ${
                  !p.available
                    ? 'border-slate-100 bg-slate-50 opacity-50'
                    : isSelected
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-200 bg-white active:bg-slate-50'
                }`}
              >
                {/* Icon */}
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                  p.type === 'inner' ? 'bg-slate-800' : 'bg-blue-600'
                }`}>
                  {p.type === 'inner'
                    ? <Printer className="h-5 w-5 text-white" />
                    : <Bluetooth className="h-5 w-5 text-white" />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 text-sm truncate">{p.name}</p>
                    {isDefault && (
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-medium">ค่าเริ่มต้น</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {p.type === 'inner' ? 'เครื่องพิมพ์ภายใน' : `Bluetooth · ${p.address}`}
                    {!p.available && ' · ไม่พร้อม'}
                  </p>
                </div>

                {/* Selection indicator */}
                {isSelected && p.available && (
                  <CheckCircle2 className="h-5 w-5 text-blue-600 shrink-0" />
                )}
              </button>
            )
          })
        )}

        {/* Open Bluetooth settings to pair new printer */}
        <button
          onClick={openBluetoothSettings}
          className="w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-400 active:border-slate-300"
        >
          <div className="h-10 w-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
            <Settings className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-600">จับคู่เครื่องพิมพ์ใหม่</p>
            <p className="text-xs text-slate-400">เปิดการตั้งค่า Bluetooth ของ Android</p>
          </div>
        </button>
      </div>

      {/* Save as default toggle */}
      {selected && selected.available && (
        <div className="px-4 py-2 border-t border-slate-100 shrink-0">
          <button
            onClick={() => setSaveDefault((v) => !v)}
            className="flex items-center gap-3 w-full py-2"
          >
            <div className={`h-6 w-11 rounded-full transition-colors relative ${
              saveDefault ? 'bg-blue-600' : 'bg-slate-300'
            }`}>
              <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                saveDefault ? 'translate-x-5' : 'translate-x-0.5'
              }`} />
            </div>
            <span className="text-sm text-slate-700 font-medium">ตั้งเป็นเครื่องพิมพ์เริ่มต้น</span>
          </button>
        </div>
      )}

      {/* Proceed button */}
      <div className="px-4 pb-6 pt-2 shrink-0">
        <button
          disabled={!canProceed}
          onClick={() => selected && onSelect(selected, saveDefault)}
          className="w-full h-14 rounded-2xl bg-blue-600 text-white font-bold text-base active:bg-blue-700 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          ดูตัวอย่างใบเสร็จ
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

// ── Preview + print step ──────────────────────────────────────────────────────

interface PreviewStepProps {
  previewData:      ThermalPreviewData
  receiptHtml:      string
  jobName:          string
  printer:          PrinterInfo | null   // null = web fallback (window.print)
  onChangePrinter?: () => void
  onShare?:         () => Promise<void>
  onSuccess:        () => void
  onError:          (msg: string) => void
}

function PreviewStep({
  previewData, receiptHtml, jobName, printer,
  onChangePrinter, onShare, onSuccess, onError,
}: PreviewStepProps) {
  const [sharing, setSharing] = useState(false)

  async function handlePrint() {
    if (printer) {
      // Native: send to printer via plugin
      const { SunmiPrinter } = await import('@/lib/sunmi-printer')
      const res = await SunmiPrinter.printHtml({
        html:      receiptHtml,
        printerId: printer.id,
        jobName,
      })
      if (process.env.NODE_ENV === 'development') {
        console.log('[PRINTER_DBG]', JSON.stringify({
          success:   res.success,
          error:     res.error,
          density:   res.dbg_density,
          renderW:   res.dbg_renderW,
          cssH:      res.dbg_cssH,
          viewScale: res.dbg_viewScale,
          contentH:  res.dbg_contentH,
          rawBmp:    `${res.dbg_rawW}×${res.dbg_rawH}`,
          scaledBmp: `${res.dbg_scaledW}×${res.dbg_scaledH}`,
          bpr:       res.dbg_bpr,
          bytes:     res.dbg_bytes,
        }))
      }
      if (!res.success) throw new Error(res.error ?? 'Print failed')
    } else {
      // Web: popup window.print()
      const win = window.open('', '_blank', 'width=320,height=600,toolbar=0,menubar=0')
      if (win) {
        win.document.write(receiptHtml)
        win.document.close()
        win.focus()
        setTimeout(() => { win.print(); setTimeout(() => win.close(), 800) }, 300)
      }
    }
  }

  async function handleShare() {
    if (!onShare) return
    setSharing(true)
    try { await onShare() } finally { setSharing(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header bar */}
      <div className="px-4 pt-1 pb-2 shrink-0 flex items-center justify-between">
        <p className="font-bold text-base text-slate-900">ตัวอย่างใบเสร็จ</p>
        {printer && (
          <div className="flex items-center gap-1.5">
            {printer.type === 'inner'
              ? <Printer className="h-3.5 w-3.5 text-slate-500" />
              : <Bluetooth className="h-3.5 w-3.5 text-blue-500" />}
            <span className="text-xs text-slate-500">{printer.name}</span>
            {onChangePrinter && (
              <button onClick={onChangePrinter} className="text-xs text-blue-600 ml-1 underline">
                เปลี่ยน
              </button>
            )}
          </div>
        )}
      </div>

      {/* Receipt preview (scrollable) — full-width paper strip on gray tray */}
      <div className="flex-1 overflow-y-auto bg-slate-200">
        <ThermalReceiptCard data={previewData} />
      </div>

      {/* Action buttons */}
      <div className="px-4 pb-8 pt-3 shrink-0 space-y-2.5">
        {/* Main print button */}
        <PrintButton onPrint={handlePrint} onSuccess={onSuccess} onError={onError}
          label={printer ? `พิมพ์ไปยัง ${printer.name}` : 'พิมพ์ (เว็บเบราว์เซอร์)'}
          icon={<Printer className="h-5 w-5" />}
        />

        {/* Share button */}
        {onShare && (
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700 disabled:opacity-60"
          >
            {sharing
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              : <Share2 className="h-4 w-4" />}
            แชร์ข้อความ (LINE / WhatsApp)
          </button>
        )}
      </div>
    </div>
  )
}

// ── PrintButton with internal pending state ───────────────────────────────────

function PrintButton({
  onPrint, onSuccess, onError, label, icon,
}: {
  onPrint:   () => Promise<void>
  onSuccess: () => void
  onError:   (msg: string) => void
  label:     string
  icon:      React.ReactNode
}) {
  const [pending, setPending] = useState(false)

  async function handle() {
    setPending(true)
    try {
      await onPrint()
      onSuccess()
    } catch (e: any) {
      onError(e?.message ?? 'เกิดข้อผิดพลาด')
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-base active:bg-slate-700 disabled:opacity-60"
    >
      {pending
        ? <span className="h-5 w-5 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
        : icon}
      {pending ? 'กำลังส่งไปเครื่องพิมพ์...' : label}
    </button>
  )
}

// ── Success step ──────────────────────────────────────────────────────────────

function SuccessStep({
  previewData, onReprint, onClose, successNavItems,
}: {
  previewData:       ThermalPreviewData
  onReprint:         () => void
  onClose:           () => void
  successNavItems?:  { label: string; href: string }[]
}) {
  const router = useRouter()
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto px-4 pb-2">
        {/* Success banner */}
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-4 mt-2 mb-4">
          <CheckCircle2 className="h-7 w-7 text-green-600 shrink-0" />
          <div>
            <p className="font-bold text-green-800 text-base">พิมพ์เสร็จแล้ว</p>
            <p className="text-xs text-green-600 font-mono mt-0.5">#{previewData.number}</p>
          </div>
        </div>

        {/* Navigation shortcuts */}
        {successNavItems && successNavItems.length > 0 && (
          <div className="space-y-2 mb-4">
            {successNavItems.map((item) => (
              <button
                key={item.href}
                onClick={() => router.push(item.href)}
                className="w-full h-13 py-3 rounded-2xl bg-slate-800 text-white font-medium active:bg-slate-700 text-sm"
              >
                {item.label}
              </button>
            ))}
          </div>
        )}

        {/* Reprint + done */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={onReprint}
            className="flex items-center justify-center gap-1.5 h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium text-sm active:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            พิมพ์อีกครั้ง
          </button>
          <button
            onClick={onClose}
            className="h-12 rounded-2xl border-2 border-slate-200 text-slate-700 font-medium text-sm active:bg-slate-50"
          >
            เสร็จสิ้น
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Error step ────────────────────────────────────────────────────────────────

function ErrorStep({ message, onRetry, onClose }: { message: string; onRetry: () => void; onClose: () => void }) {
  return (
    <div className="px-4 pb-8 space-y-3">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <XCircle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="font-bold text-red-800">พิมพ์ไม่สำเร็จ</p>
        </div>
        {message && <p className="text-xs text-red-600 font-mono mt-1">{message}</p>}
        <div className="mt-3 text-xs text-red-700 space-y-1">
          <p>• ตรวจสอบว่า Bluetooth เปิดอยู่</p>
          <p>• ตรวจสอบว่าเครื่องพิมพ์เปิดอยู่และมีกระดาษ</p>
          <p>• ลองเข้าใกล้เครื่องพิมพ์</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onRetry}
          className="h-12 rounded-2xl bg-slate-800 text-white font-medium active:bg-slate-700"
        >
          ลองใหม่
        </button>
        <button
          onClick={onClose}
          className="h-12 rounded-2xl border-2 border-slate-200 text-slate-600 font-medium active:bg-slate-50"
        >
          ข้ามไปก่อน
        </button>
      </div>
    </div>
  )
}

// ── Auto-print in progress step ──────────────────────────────────────────────

function PrintingStep({ printerName }: { printerName: string }) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 gap-4 px-4 py-16">
      <span className="h-12 w-12 animate-spin rounded-full border-4 border-slate-200 border-t-slate-800" />
      <div className="text-center">
        <p className="font-bold text-slate-800 text-base">กำลังส่งไปเครื่องพิมพ์...</p>
        <p className="text-xs text-slate-400 mt-1">{printerName}</p>
      </div>
    </div>
  )
}

// ── Main PrinterFlowSheet ─────────────────────────────────────────────────────

export function PrinterFlowSheet({
  receiptHtml, jobName, previewData,
  onShare, onClose, successNavItems, autoPrint,
}: PrinterFlowSheetProps) {
  const isNative = Platform.isNative()

  // On web: skip printer picker and go straight to preview with null printer
  const [state,    setState]   = useState<FlowState>(isNative ? 'pick-printer' : 'preview')
  const [printer,  setPrinter] = useState<PrinterInfo | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const autoPrintFiredRef      = useRef(false)

  // Android back button
  useEffect(() => pushBackHandler(onClose), [onClose])

  // On native, auto-load the default printer — if set, jump to preview (or auto-print)
  useEffect(() => {
    if (!isNative) return
    let cancelled = false
    async function tryDefault() {
      try {
        const { SunmiPrinter } = await import('@/lib/sunmi-printer')
        const { printerId } = await SunmiPrinter.getDefaultPrinter()
        if (cancelled || !printerId) return
        const { printers } = await SunmiPrinter.getAvailablePrinters()
        const found = printers.find((p) => p.id === printerId && p.available)
        if (!found || cancelled) return
        setPrinter(found)
        if (autoPrint && !autoPrintFiredRef.current) {
          // One-tap: skip preview and print immediately
          autoPrintFiredRef.current = true
          setState('auto-printing')
          try {
            const res = await SunmiPrinter.printHtml({ html: receiptHtml, printerId: found.id, jobName })
            if (!res.success) throw new Error(res.error ?? 'พิมพ์ไม่สำเร็จ กรุณาลองใหม่')
            if (!cancelled) setState('success')
          } catch (e: any) {
            if (!cancelled) {
              setErrorMsg(e?.message ?? 'พิมพ์ไม่สำเร็จ กรุณาลองใหม่')
              setState('error')
            }
          }
        } else {
          setState('preview')
        }
      } catch {
        // No default or unavailable — stay on picker
      }
    }
    tryDefault()
    return () => { cancelled = true }
  // autoPrint, receiptHtml, jobName are stable props — only re-run when isNative changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNative])

  const handlePickerSelect = useCallback(async (p: PrinterInfo, save: boolean) => {
    setPrinter(p)
    if (save) {
      try {
        const { SunmiPrinter } = await import('@/lib/sunmi-printer')
        await SunmiPrinter.setDefaultPrinter({ printerId: p.id, printerName: p.name })
      } catch { /* non-critical */ }
    }
    setState('preview')
  }, [])

  return (
    // Full-screen bottom sheet overlay
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl max-h-[94vh] flex flex-col">
        {/* Drag handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <div className="flex-1">
            {state === 'preview' && isNative && (
              <button
                onClick={() => setState('pick-printer')}
                className="flex items-center gap-1 text-slate-400 active:text-slate-700 text-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                เครื่องพิมพ์
              </button>
            )}
          </div>
          <div className="w-10 h-1 rounded-full bg-slate-300" />
          <div className="flex-1 flex justify-end">
            <button
              onClick={onClose}
              disabled={state === 'printing'}
              className="h-9 w-9 flex items-center justify-center text-slate-400 active:text-slate-700 disabled:opacity-30"
            >
              <span className="text-xl leading-none">×</span>
            </button>
          </div>
        </div>

        {/* Step: Printer picker */}
        {state === 'pick-printer' && (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <PrinterPickerStep
              onSelect={handlePickerSelect}
              onClose={onClose}
            />
          </div>
        )}

        {/* Step: Auto-printing (one-tap, skip preview) */}
        {state === 'auto-printing' && (
          <div className="flex-1 flex flex-col min-h-0">
            <PrintingStep printerName={printer?.name ?? ''} />
          </div>
        )}

        {/* Step: Preview + print */}
        {(state === 'preview' || state === 'printing') && (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            <PreviewStep
              previewData={previewData}
              receiptHtml={receiptHtml}
              jobName={jobName}
              printer={printer}
              onChangePrinter={isNative ? () => setState('pick-printer') : undefined}
              onShare={onShare}
              onSuccess={() => setState('success')}
              onError={(msg) => { setErrorMsg(msg); setState('error') }}
            />
          </div>
        )}

        {/* Step: Success */}
        {state === 'success' && (
          <div className="flex-1 overflow-y-auto min-h-0">
            <SuccessStep
              previewData={previewData}
              onReprint={() => setState('preview')}
              onClose={onClose}
              successNavItems={successNavItems}
            />
          </div>
        )}

        {/* Step: Error */}
        {state === 'error' && (
          <ErrorStep
            message={errorMsg}
            onRetry={() => { autoPrintFiredRef.current = false; setState('preview') }}
            onClose={onClose}
          />
        )}
      </div>
    </div>
  )
}
