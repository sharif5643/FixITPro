'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Users, Phone, ChevronRight, AlertTriangle, CheckCircle2, RefreshCcw } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { PCard, Skel, CardHeader } from './primitives'
import type { CustomerDebtItem } from './types'

export function CustomerFollowup() {
  const hasModule = useAuthStore(s => s.hasModule)
  const enabled   = hasModule('crm')

  const { data, isLoading, isError, refetch } = useQuery<CustomerDebtItem[]>({
    queryKey: ['customers', 'debt-summary'],
    queryFn:  () => api.get('/customers/debt-summary').then(r => r.data),
    enabled,
    staleTime: 5 * 60_000,
  })

  const list      = data ?? []
  const totalDebt = list.reduce((s, c) => s + c.totalDebt, 0)
  const overLimit = Math.max(0, list.length - 6)

  return (
    <PCard className="p-5" urgent={list.length > 0 && totalDebt > 0}>
      <CardHeader
        icon={Users}
        iconBg="bg-blue-50 dark:bg-blue-900/30"
        iconColor="text-blue-600 dark:text-blue-400"
        title="ติดตามลูกค้า"
      >
        {list.length > 0 && (
          <Link
            href="/customers"
            className="ml-auto text-[10px] text-blue-500 font-semibold hover:underline flex items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            จัดการ <ChevronRight className="h-3 w-3" aria-hidden />
          </Link>
        )}
      </CardHeader>

      {!enabled ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Users className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden />
          <p className="text-xs text-slate-400 dark:text-slate-500">ไม่ได้เปิดใช้โมดูล CRM</p>
        </div>

      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skel key={i} className="h-11 w-full" />)}
        </div>

      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden />
          <p className="text-xs text-slate-400 dark:text-slate-500">โหลดข้อมูลไม่สำเร็จ</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <RefreshCcw className="h-2.5 w-2.5" aria-hidden />ลองใหม่
          </button>
        </div>

      ) : list.length === 0 ? (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/60 rounded-xl px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" aria-hidden />
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">ไม่มีลูกค้าค้างชำระ</p>
        </div>

      ) : (
        <div className="space-y-3">

          {/* Total outstanding banner */}
          <div className="flex items-center justify-between bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 rounded-xl px-3 py-2">
            <p className="text-xs text-red-600 dark:text-red-400 font-semibold">ยอดค้างชำระรวม</p>
            <p className="text-sm font-black text-red-600 dark:text-red-400 tabular-nums">
              {formatThaiMoney(totalDebt)}
            </p>
          </div>

          {/* Debtor list */}
          <ul className="space-y-1.5" aria-label="รายชื่อลูกค้าค้างชำระ">
            {list.slice(0, 6).map(c => (
              <li key={c.customerId}>
                <Link
                  href={`/customers/${c.customerId}`}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-700/60',
                    'px-3 py-2 min-h-[44px]',
                    'hover:bg-slate-50 dark:hover:bg-slate-800/60 motion-safe:transition-colors',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
                  )}
                  aria-label={`${c.name} — ค้างชำระ ${formatThaiMoney(c.totalDebt)}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">{c.name}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 mt-0.5">
                      <Phone className="h-2.5 w-2.5 flex-shrink-0" aria-hidden />
                      {c.phone}
                      <span className="mx-0.5">·</span>
                      {c.repairCount} ชิ้น
                    </p>
                  </div>
                  <span className="text-xs font-bold text-red-500 tabular-nums flex-shrink-0">
                    {formatThaiMoney(c.totalDebt)}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {overLimit > 0 && (
            <Link
              href="/customers"
              className="block text-center text-[10px] text-blue-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded py-1"
            >
              และอีก {overLimit} คน →
            </Link>
          )}
        </div>
      )}
    </PCard>
  )
}
