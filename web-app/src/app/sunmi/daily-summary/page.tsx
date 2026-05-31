'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ChevronLeft, RefreshCw, TrendingUp, ShoppingCart, Wrench,
  Wifi, AlertTriangle, Clock, Package,
} from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

interface DailyClosing {
  revenue: {
    pos: { total: number; count: number }
    repairs: { total: number; count: number }
    packages: { total: number; count: number }
    voided: { total: number; count: number }
    outstanding: { total: number; count: number }
    grandTotal: number
    cash: number
    transfer: number
    card: number
  }
  repairSummary: { overdue: number; byStatus: Record<string, number> }
  lowStock: { count: number }
}

interface SummaryTileProps {
  label: string
  value: string
  sub?: string
  color?: string
  icon: React.ElementType
  href?: string
  alert?: boolean
}

function SummaryTile({ label, value, sub, color = 'text-slate-900', icon: Icon, href, alert }: SummaryTileProps) {
  const router = useRouter()
  const base = `bg-white rounded-2xl p-4 space-y-1 shadow-sm active:scale-[0.97] transition-transform ${
    alert ? 'border border-red-200 bg-red-50' : ''
  }`
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          alert ? 'bg-red-100' : 'bg-slate-100'
        }`}>
          <Icon className={`h-4 w-4 ${alert ? 'text-red-500' : 'text-slate-500'}`} />
        </div>
        <p className="text-xs text-slate-500 font-medium">{label}</p>
      </div>
      <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </>
  )

  if (href) {
    return (
      <button onClick={() => router.push(href)} className={`${base} w-full text-left`}>
        {inner}
      </button>
    )
  }
  return <div className={base}>{inner}</div>
}

export default function SunmiDailySummaryPage() {
  const router = useRouter()
  const { user, hasPermission } = useAuthStore()
  const isOwnerOrManager = user?.role === 'OWNER' || user?.role === 'MANAGER' || hasPermission('reports.view')
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayThai = format(new Date(), 'EEEE d MMM yyyy', { locale: th })

  const { data, isLoading, refetch, isRefetching } = useQuery<DailyClosing>({
    queryKey: ['daily-closing', today],
    queryFn: async () => (await api.get('/reports/daily-closing', { params: { date: today } })).data,
    enabled: isOwnerOrManager,
    staleTime: 60_000,
  })

  if (!isOwnerOrManager) {
    return (
      <SunmiShell title="สรุปรายได้วันนี้" showBack>
        <div className="flex flex-col items-center justify-center h-52 text-slate-400">
          <AlertTriangle className="h-12 w-12 mb-3 opacity-20" />
          <p className="text-base font-medium">ไม่มีสิทธิ์เข้าถึง</p>
        </div>
      </SunmiShell>
    )
  }

  const repairActive = Object.values(data?.repairSummary.byStatus ?? {}).reduce((a, b) => a + b, 0)

  return (
    <SunmiShell
      title="สรุปรายได้วันนี้"
      showBack
      rightContent={
        <button
          onClick={() => refetch()}
          disabled={isRefetching}
          className="h-10 w-10 flex items-center justify-center text-slate-300 active:text-white"
        >
          <RefreshCw className={`h-5 w-5 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="p-3 pb-8 space-y-4">
        {/* Date */}
        <div className="px-1">
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">{todayThai}</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 bg-white rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : data ? (
          <>
            {/* Revenue tiles */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryTile
                label="รวมรายได้วันนี้"
                value={formatThaiMoney(data.revenue.grandTotal)}
                sub="ทุกช่องทาง"
                color="text-slate-900"
                icon={TrendingUp}
              />
              <SummaryTile
                label="ขายสินค้า POS"
                value={formatThaiMoney(data.revenue.pos.total)}
                sub={`${data.revenue.pos.count} รายการ`}
                color="text-green-700"
                icon={ShoppingCart}
                href="/sunmi/sales/history"
              />
              <SummaryTile
                label="รายได้ซ่อม"
                value={formatThaiMoney(data.revenue.repairs.total)}
                sub={`${data.revenue.repairs.count} งาน`}
                color="text-blue-700"
                icon={Wrench}
                href="/sunmi/repairs"
              />
              <SummaryTile
                label="ขาย SIM/Net"
                value={formatThaiMoney(data.revenue.packages.total)}
                sub={`${data.revenue.packages.count} รายการ`}
                color="text-cyan-700"
                icon={Wifi}
                href="/sunmi/sim-sales"
              />
            </div>

            {/* Payment method breakdown */}
            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">แบ่งตามช่องทาง</p>
              <div className="space-y-2">
                {[
                  { label: 'เงินสด', value: data.revenue.cash },
                  { label: 'โอนเงิน', value: data.revenue.transfer },
                  { label: 'บัตร', value: data.revenue.card },
                ].map(({ label, value }) => {
                  const total = data.revenue.grandTotal || 1
                  const pct = Math.round((value / total) * 100)
                  return (
                    <div key={label} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-bold tabular-nums">{formatThaiMoney(value)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div
                          className="bg-slate-700 h-1.5 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Alerts */}
            <div className="grid grid-cols-2 gap-3">
              <SummaryTile
                label="งานซ่อมค้างอยู่"
                value={String(repairActive)}
                sub="งานที่ยังไม่ส่งมอบ"
                color="text-slate-800"
                icon={Clock}
                href="/sunmi/repairs"
              />
              <SummaryTile
                label="หนี้ค้างชำระ"
                value={String(data.revenue.outstanding.count)}
                sub={data.revenue.outstanding.count > 0 ? formatThaiMoney(data.revenue.outstanding.total) : undefined}
                color={data.revenue.outstanding.count > 0 ? 'text-amber-700' : 'text-slate-500'}
                icon={AlertTriangle}
                alert={data.revenue.outstanding.count > 0}
                href="/sunmi/repairs"
              />
              {data.repairSummary.overdue > 0 && (
                <SummaryTile
                  label="งานเกินกำหนด"
                  value={String(data.repairSummary.overdue)}
                  color="text-red-600"
                  icon={AlertTriangle}
                  alert
                  href="/sunmi/repairs"
                />
              )}
              {data.lowStock.count > 0 && (
                <SummaryTile
                  label="สินค้าใกล้หมด"
                  value={String(data.lowStock.count)}
                  sub="รายการ"
                  color="text-orange-600"
                  icon={Package}
                  href="/sunmi/stock"
                />
              )}
            </div>

            {/* Voided */}
            {data.revenue.voided.count > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-3.5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-red-700 text-sm">บิลยกเลิกวันนี้</p>
                  <p className="text-xs text-red-500 mt-0.5">{data.revenue.voided.count} รายการ · {formatThaiMoney(data.revenue.voided.total)}</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
            )}

            {/* Link to full report */}
            <button
              onClick={() => router.push('/reports/daily-closing')}
              className="w-full bg-slate-800 text-white rounded-2xl py-4 font-bold flex items-center justify-center gap-2 active:bg-slate-700 transition-colors"
            >
              ดูรายงานปิดวันฉบับเต็ม
              <ChevronLeft className="h-5 w-5 rotate-180" />
            </button>
          </>
        ) : null}
      </div>
    </SunmiShell>
  )
}
