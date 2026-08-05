'use client'

import { useState } from 'react'
import { Usb } from 'lucide-react'
import { toast } from 'sonner'
import {
  isWebSerialSupported,
  hasSavedPort,
  serialPrintReceipt,
  serialPrintRepairIntake,
} from '@/lib/serial-printer'
import type { PrintReceiptOptions, PrintRepairIntakeOptions } from '@/lib/printer'

type Props =
  | { mode: 'receipt'; opts: PrintReceiptOptions }
  | { mode: 'repair';  opts: PrintRepairIntakeOptions }

export function SerialPrintButton(props: Props) {
  const [loading, setLoading] = useState(false)
  const [hasPort, setHasPort] = useState<boolean | null>(null)

  if (!isWebSerialSupported()) return null

  // Lazily check saved port on first render
  if (hasPort === null) {
    hasSavedPort().then(setHasPort)
  }

  async function handleClick() {
    setLoading(true)
    try {
      if (props.mode === 'receipt') {
        await serialPrintReceipt(props.opts)
      } else {
        await serialPrintRepairIntake(props.opts)
      }
      // After successful print, we know a port is saved
      setHasPort(true)
      toast.success('พิมพ์เสร็จแล้ว')
    } catch (err: any) {
      if (err?.name === 'NotFoundError') {
        // User cancelled the port picker — not an error
      } else {
        toast.error(`พิมพ์ไม่สำเร็จ: ${err?.message ?? 'ไม่ทราบสาเหตุ'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const label = hasPort ? 'พิมพ์ USB/BT' : 'เลือกพอร์ต + พิมพ์'

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      title="พิมพ์ตรงผ่าน USB หรือ Bluetooth (Web Serial) — รองรับ Chrome/Edge"
      className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700/60 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-slate-700/60 transition-colors disabled:opacity-50"
    >
      <Usb className={`h-3.5 w-3.5 ${loading ? 'animate-pulse' : ''}`} />
      {loading ? 'กำลังพิมพ์…' : label}
    </button>
  )
}
