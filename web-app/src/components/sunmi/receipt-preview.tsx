'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Printer, Share2, X, CheckCircle2, ChevronLeft, Home } from 'lucide-react'
import { pushBackHandler } from '@/lib/back-stack'

export type PrintAction = 'print' | 'share' | 'back'

interface ReceiptLine {
  label: string
  value: string
  bold?: boolean
}

export interface ReceiptPreviewData {
  title: string          // e.g. "ใบรับซ่อม" | "ใบเสร็จ"
  ticketOrReceiptNumber: string
  lines: ReceiptLine[]
}

interface ReceiptPreviewSheetProps {
  data: ReceiptPreviewData
  onPrint: () => Promise<void>
  onShare: () => Promise<void>
  onClose: () => void
  /** After print/share success: where can user navigate next? */
  successNavItems?: {
    label: string
    href: string
  }[]
}

type SheetState = 'preview' | 'printing' | 'success' | 'error'

export function ReceiptPreviewSheet({
  data,
  onPrint,
  onShare,
  onClose,
  successNavItems,
}: ReceiptPreviewSheetProps) {
  const router = useRouter()
  const [state, setState] = useState<SheetState>('preview')
  const [errorMsg, setErrorMsg] = useState('')

  // Android back button closes the sheet
  useEffect(() => pushBackHandler(onClose), [onClose])

  async function handleAction(action: PrintAction) {
    if (action === 'back') { onClose(); return }

    setState('printing')
    setErrorMsg('')
    try {
      if (action === 'print') await onPrint()
      else await onShare()
      setState('success')
    } catch (e: any) {
      setErrorMsg(e?.message ?? 'เกิดข้อผิดพลาด')
      setState('error')
    }
  }

  return (
    // Full-screen overlay
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative bg-white rounded-t-3xl max-h-[92vh] flex flex-col">
        {/* Handle + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 shrink-0">
          <div className="flex-1" />
          <div className="w-10 h-1 rounded-full bg-slate-300 mx-auto" />
          <div className="flex-1 flex justify-end">
            <button
              onClick={onClose}
              className="h-9 w-9 flex items-center justify-center text-slate-400 active:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Title */}
        <div className="px-4 pb-2 shrink-0">
          <p className="font-bold text-lg text-slate-900">{data.title}</p>
          <p className="text-sm text-blue-600 font-mono font-semibold">#{data.ticketOrReceiptNumber}</p>
        </div>

        {/* Receipt preview (scrollable) */}
        <div className="flex-1 overflow-y-auto px-4 pb-2">
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2 font-mono text-sm">
            {data.lines.map((line, i) => (
              <div key={i} className={`flex justify-between gap-2 ${line.bold ? 'font-bold text-base' : ''}`}>
                <span className="text-slate-600 shrink-0">{line.label}</span>
                <span className={`text-right ${line.bold ? 'text-slate-900' : 'text-slate-800'}`}>{line.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-8 pt-3 shrink-0 space-y-3">
          {state === 'preview' && (
            <>
              <button
                onClick={() => handleAction('print')}
                className="flex items-center justify-center gap-2 w-full h-14 rounded-2xl bg-slate-900 text-white font-bold text-base active:bg-slate-700"
              >
                <Printer className="h-5 w-5" />
                พิมพ์ (เลือกเครื่องพิมพ์)
              </button>
              <button
                onClick={() => handleAction('share')}
                className="flex items-center justify-center gap-2 w-full h-12 rounded-2xl bg-blue-600 text-white font-semibold text-sm active:bg-blue-700"
              >
                <Share2 className="h-4 w-4" />
                แชร์ข้อความ (LINE / WhatsApp)
              </button>
              <button
                onClick={onClose}
                className="w-full h-11 rounded-2xl border-2 border-slate-200 text-slate-500 text-sm font-medium active:bg-slate-50"
              >
                ข้ามไปก่อน
              </button>
            </>
          )}

          {state === 'printing' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-300 border-t-slate-800" />
              <p className="text-slate-600 font-medium">กำลังดำเนินการ...</p>
            </div>
          )}

          {state === 'success' && (
            <div className="space-y-3">
              <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-2xl p-4">
                <CheckCircle2 className="h-6 w-6 text-green-600 shrink-0" />
                <div>
                  <p className="font-bold text-green-800">พิมพ์เสร็จแล้ว</p>
                  <p className="text-xs text-green-600">#{data.ticketOrReceiptNumber}</p>
                </div>
              </div>

              {successNavItems && successNavItems.length > 0 && (
                <div className="space-y-2">
                  {successNavItems.map((item) => (
                    <button
                      key={item.href}
                      onClick={() => router.push(item.href)}
                      className="w-full h-12 rounded-2xl bg-slate-800 text-white font-medium active:bg-slate-700"
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setState('preview')}
                  className="flex items-center justify-center gap-1 h-12 rounded-2xl border-2 border-slate-200 text-slate-600 font-medium active:bg-slate-50 text-sm"
                >
                  <Printer className="h-4 w-4" />
                  พิมพ์อีกครั้ง
                </button>
                <button
                  onClick={onClose}
                  className="h-12 rounded-2xl border-2 border-slate-200 text-slate-600 font-medium active:bg-slate-50 text-sm"
                >
                  เสร็จสิ้น
                </button>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <p className="font-bold text-red-800">เกิดข้อผิดพลาด</p>
                {errorMsg && <p className="text-xs text-red-600 mt-1 font-mono">{errorMsg}</p>}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setState('preview')}
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
          )}
        </div>
      </div>
    </div>
  )
}
