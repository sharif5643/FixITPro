'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { Clock, Wallet, ShoppingCart, Wrench, TrendingUp, AlertCircle, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Type (mirrors shifts/page.tsx ActiveShift) ────────────────────────────────

interface ActiveShift {
  id: string
  openedAt: string
  openBalance: number
  note: string | null
  isActive: true
  user: { id: string; name: string }
  salesCount: number
  totalSales: number
  repairCount: number
  repairRevenue: number
  expectedCashBalance: number
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CashDrawerWidget() {
  const { data: shift, isLoading } = useQuery<ActiveShift | null>({
    queryKey: ['shifts', 'current'],
    queryFn: async () => (await api.get('/shifts/current')).data,
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  if (isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] p-4 animate-pulse">
        <div className="h-4 w-24 bg-slate-100 dark:bg-slate-800 rounded mb-3" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-14 bg-slate-100 dark:bg-slate-800 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (!shift) {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-[#1E293B]/40 p-5 flex flex-col items-center gap-3 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Clock className="h-5 w-5 text-slate-400 dark:text-slate-500" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">ยังไม่ได้เปิดกะ</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ต้องเปิดกะก่อนจึงจะขายสินค้าได้</p>
        </div>
        <Link href="/shifts">
          <Button size="sm" className="gap-1.5 h-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs">
            <Clock className="h-3.5 w-3.5" />เปิดกะเดี๋ยวนี้
          </Button>
        </Link>
      </div>
    )
  }

  const expectedCash = Number(shift.openBalance) + Number(shift.totalSales) + Number(shift.repairRevenue ?? 0)

  const stats = [
    {
      label: 'เงินเริ่มต้น',
      value: formatThaiMoney(Number(shift.openBalance)),
      icon: Wallet,
      color: 'text-slate-600 dark:text-slate-300',
      iconColor: 'text-slate-400',
    },
    {
      label: `ยอดขาย POS (${shift.salesCount} บิล)`,
      value: formatThaiMoney(Number(shift.totalSales)),
      icon: ShoppingCart,
      color: 'text-blue-700 dark:text-blue-400',
      iconColor: 'text-blue-500',
    },
    {
      label: `รายรับซ่อม (${shift.repairCount ?? 0} งาน)`,
      value: formatThaiMoney(Number(shift.repairRevenue ?? 0)),
      icon: Wrench,
      color: 'text-purple-700 dark:text-purple-400',
      iconColor: 'text-purple-500',
    },
    {
      label: 'เงินสดที่คาดในลิ้นชัก',
      value: formatThaiMoney(expectedCash),
      icon: TrendingUp,
      color: 'text-emerald-700 dark:text-emerald-400',
      iconColor: 'text-emerald-500',
    },
  ]

  return (
    <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/40 dark:bg-emerald-900/10 p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
            <Clock className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">กะกำลังดำเนินการ — {shift.user.name}</span>
        </div>
        <Link href="/shifts" className="flex items-center gap-0.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline">
          ดูรายละเอียด <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {stats.map((s) => {
          const Icon = s.icon
          return (
            <div key={s.label} className="rounded-lg bg-white dark:bg-[#1E293B] border border-slate-100 dark:border-slate-700/60 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className={`h-3 w-3 flex-shrink-0 ${s.iconColor}`} />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{s.label}</p>
              </div>
              <p className={`text-sm font-bold tabular-nums ${s.color}`}>{s.value}</p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
