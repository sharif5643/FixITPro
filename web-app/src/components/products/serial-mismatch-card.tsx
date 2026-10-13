'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

export type SerialMismatch = {
  productId: string
  name: string
  sku: string
  units: number
  serialsInStock: number
}

/**
 * Products sold by IMEI whose stock count and IMEIs in stock disagree (older data, or IMEIs
 * changed by hand): a phone in stock with no IMEI to pick at the till, or an IMEI with no phone.
 * Shows nothing when every count matches.
 */
export function SerialMismatchCard({ className, serialsHref = '/serials' }: { className?: string; serialsHref?: string | null }) {
  const [open, setOpen] = useState(false)
  const { data: rows = [] } = useQuery<SerialMismatch[]>({
    queryKey: ['stock', 'serial-mismatch'],
    queryFn: async () => (await api.get('/stock/serial-mismatch')).data,
    staleTime: 60_000,
  })
  if (rows.length === 0) return null

  return (
    <div className={cn('rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-700/50 dark:bg-amber-900/20 dark:text-amber-200', className)}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2 text-left">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
        <span className="flex-1 text-sm">
          <span className="font-semibold">สต็อกไม่ตรงกับ IMEI {rows.length} รายการ</span>
          <span className="block text-xs opacity-80">จำนวนเครื่องในสต็อกกับ IMEI ที่อยู่ในสต็อกไม่เท่ากัน — แตะเพื่อดูและแก้</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0" /> : <ChevronDown className="h-4 w-4 shrink-0" />}
      </button>

      {open && (
        <div className="mt-3 space-y-2">
          {rows.map((r) => (
            <div key={r.productId} className="rounded-lg bg-white/70 px-3 py-2 text-sm dark:bg-slate-900/40">
              <p className="font-semibold">{r.name} <span className="font-mono text-xs font-normal opacity-70">{r.sku}</span></p>
              <p className="text-xs">
                สต็อก <span className="font-bold tabular-nums">{r.units}</span> เครื่อง · IMEI ในสต็อก <span className="font-bold tabular-nums">{r.serialsInStock}</span>
              </p>
              <p className="mt-0.5 text-xs opacity-80">
                {r.units > r.serialsInStock
                  ? `มีเครื่องที่ยังไม่มี IMEI ${r.units - r.serialsInStock} เครื่อง — ถ้ามีของจริงให้เพิ่ม IMEI ที่หน้า Serial/IMEI ถ้าไม่มีของแล้วให้ "ตัดออก" ที่ปุ่มสต็อกของสินค้า`
                  : `มี IMEI เกินมา ${r.serialsInStock - r.units} ตัว — เครื่องที่ขายหรือไม่อยู่แล้ว ให้เปลี่ยนสถานะ IMEI ที่หน้า Serial/IMEI`}
              </p>
            </div>
          ))}
          {serialsHref && (
            <Link href={serialsHref} className="inline-block text-xs font-semibold underline">ไปหน้า Serial/IMEI</Link>
          )}
        </div>
      )}
    </div>
  )
}
