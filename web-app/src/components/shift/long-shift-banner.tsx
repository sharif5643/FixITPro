'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Clock, Info } from 'lucide-react'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

/** A shift is one working day or night; past this many hours it most likely was not closed. */
export const LONG_SHIFT_HOURS = 14

export function shiftHours(openedAt?: string | null, now = Date.now()): number {
  if (!openedAt) return 0
  return Math.floor((now - new Date(openedAt).getTime()) / 3600_000)
}

/**
 * Reminds to close the shift when it has been open too long. A shift left open across days
 * lumps several days of cash into one count and the difference can no longer be traced.
 */
export function LongShiftBanner({ closeHref, className }: { closeHref: string; className?: string }) {
  const role = useAuthStore((s) => s.user?.role)
  const handlesCash = ['OWNER', 'MANAGER', 'CASHIER'].includes(role ?? '')
  const { data: shift, isSuccess } = useQuery<{ id: string; openedAt: string } | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 60_000,
    // Someone else may close the shared shift: this screen should not keep showing it open
    refetchInterval: 60_000,
    enabled: handlesCash,
  })
  const hours = shiftHours(shift?.openedAt)
  if (isSuccess && !shift?.id) return <ClosedByOtherNotice closeHref={closeHref} className={className} />
  if (!shift?.id || hours < LONG_SHIFT_HOURS) return null
  return (
    <Link
      href={closeHref}
      className={cn('flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200', className)}
    >
      <Clock className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <span className="font-semibold">กะนี้เปิดมา {hours} ชั่วโมงแล้ว</span>
        <span className="block text-xs opacity-80">ปิดกะเมื่อจบวัน แล้วเปิดกะใหม่ — ยอดเงินแต่ละวันจะได้ตรวจได้</span>
      </span>
      <span className="shrink-0 text-xs font-bold underline">ปิดกะ</span>
    </Link>
  )
}

export type ClosedByOther = { shiftId: string; openedBy: string; closedAt: string; closedBy: string }

/**
 * The shift I was working in was counted and closed by someone else (the opener, a colleague, the
 * owner): say who and when, so nobody wonders where their shift went.
 */
export function ClosedByOtherNotice({ closeHref, className }: { closeHref?: string; className?: string }) {
  const { data } = useQuery<ClosedByOther | null>({
    queryKey: ['shifts', 'closed-by-other'],
    queryFn: async () => (await api.get('/shifts/closed-by-other')).data || null,
    staleTime: 60_000,
  })
  if (!data?.shiftId) return null
  const at = new Date(data.closedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
  const body = (
    <>
      <Info className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        <span className="font-semibold">กะของ {data.openedBy} ถูกปิดแล้วโดย {data.closedBy} เวลา {at} น.</span>
        <span className="block text-xs opacity-80">ถ้าจะขายต่อ ให้เปิดกะใหม่หรือเข้าร่วมกะที่เปิดอยู่</span>
      </span>
      {closeHref && <span className="shrink-0 text-xs font-bold underline">ไปหน้ากะ</span>}
    </>
  )
  const cls = cn('flex items-center gap-2 rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-sm text-sky-900 dark:border-sky-700 dark:bg-sky-900/20 dark:text-sky-200', closeHref && 'hover:bg-sky-100', className)
  return closeHref ? <Link href={closeHref} className={cls}>{body}</Link> : <div className={cls}>{body}</div>
}
