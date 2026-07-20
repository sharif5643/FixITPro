'use client'

import Link from 'next/link'
import { RefreshCw, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import { thaiToday } from './utils'
import type { DashboardOverview } from './types'

interface Props {
  userName: string | null | undefined
  currentShift: DashboardOverview['currentShift'] | undefined
  loading: boolean
  onRefresh: () => void
}

export function OwnerCommandHeader({ userName, currentShift, loading, onRefresh }: Props) {
  const now  = thaiToday()
  const hour = now.getHours()
  const greeting = hour < 12 ? 'อรุณสวัสดิ์' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น'
  const firstName = userName?.split(' ')[0] ?? 'เจ้าของ'

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-xl font-black text-slate-900 dark:text-white">
          {greeting}, {firstName} 👋
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
          {format(now, 'EEEEที่ d MMMM yyyy', { locale: th })}
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <BranchContextBar />

        {currentShift?.isOpen ? (
          <span className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700/60 px-2.5 py-1.5 rounded-xl min-h-[36px]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" aria-hidden />
            กะเปิดอยู่
          </span>
        ) : (
          <Link
            href="/shifts"
            className="flex items-center gap-1.5 text-xs font-semibold bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-700/60 px-2.5 py-1.5 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors min-h-[36px]"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            เปิดกะ
          </Link>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className={cn(
            'p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
            'hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
            'min-h-[36px] min-w-[36px]',
          )}
          aria-label="รีเฟรชข้อมูลแดชบอร์ด"
        >
          <RefreshCw className={cn('h-4 w-4', loading && 'motion-safe:animate-spin')} aria-hidden />
        </button>
      </div>
    </div>
  )
}
