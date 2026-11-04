'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'

/**
 * Closing a shift, the same on the web, the staff app and SUNMI: count the drawer, close, then
 * print and (if the shop works round the clock) open the next shift. A few baht over or short
 * needs no explanation; more than this does.
 */
export const NOTE_REQUIRED_DIFF = 50

export function noteRequiredFor(diff: number | null | undefined): boolean {
  return diff != null && Math.abs(diff) > NOTE_REQUIRED_DIFF
}

/** What the next shift opens with: the change left for it, or else everything counted. */
export function nextOpeningOf(counted: number, floatLeft: string | number | null | undefined): number {
  return floatLeft !== '' && floatLeft != null ? Number(floatLeft) || 0 : counted
}

/** ✓ ยอดตรง / ขาด ฿x / เกิน ฿x, big enough to read at a glance */
export function DiffBadge({ diff, className }: { diff: number | null; className?: string }) {
  if (diff == null) return null
  const d = Math.round(diff * 100) / 100
  const tone = d === 0
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
    : d < 0 ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
    : 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400'
  return (
    <p className={cn('flex items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-base font-bold', tone, className)}>
      {d === 0 ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
      {d === 0 ? 'ยอดตรง' : `${d < 0 ? 'ขาด' : 'เกิน'} ${formatThaiMoney(Math.abs(d))}`}
    </p>
  )
}

/** True once `busy` has lasted `ms`: a close that hangs says so instead of spinning silently. */
export function useSlowHint(busy: boolean, ms = 10_000): boolean {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    if (!busy) { setSlow(false); return }
    const t = setTimeout(() => setSlow(true), ms)
    return () => clearTimeout(t)
  }, [busy, ms])
  return slow
}

export function SlowHint({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-center text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
      ระบบตอบช้ากว่าปกติ กำลังปิดกะอยู่ — ถ้าเกิน 30 วินาทีจะแจ้งให้ลองใหม่
    </p>
  )
}

/** How long the close request may take before we stop waiting and say so */
export const CLOSE_TIMEOUT_MS = 30_000

/**
 * Prints a page without leaving this one: on a computer it prints from a hidden frame (no new
 * tab to get lost in); phones and tablets print a frame poorly, so there it opens a tab.
 */
export function printPage(url: string) {
  const desktop = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches
  if (!desktop) { window.open(url, '_blank'); return }
  document.getElementById('print-frame')?.remove()
  const frame = document.createElement('iframe')
  frame.id = 'print-frame'
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  frame.src = url  // the page prints itself once its report has loaded
  document.body.appendChild(frame)
}
