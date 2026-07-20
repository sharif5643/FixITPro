'use client'

import Link from 'next/link'
import { TrendingUp, TrendingDown, Wrench, CheckCircle2, Banknote } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { Skel, PCard, hoverCard } from './primitives'
import { computeRevenueDelta } from './utils'
import type { DashboardOverview, OwnerSummaryData } from './types'

// ── Individual KPI card ───────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accentColor, iconBg, urgent, loading, href, trend, deltaText,
}: {
  label: string; value: string; sub?: string; icon: React.ElementType
  accentColor: string; iconBg: string; urgent?: boolean; loading?: boolean
  href?: string; trend?: 'up' | 'down' | null; deltaText?: string | null
}) {
  const inner = (
    <PCard urgent={urgent} className={cn('p-5 group cursor-pointer', hoverCard)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className={cn(
            'text-[11px] font-bold uppercase tracking-widest',
            urgent ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500',
          )}>
            {label}
          </p>
          {loading
            ? <Skel className="h-8 w-28 mt-2" />
            : (
              <p className={cn(
                'text-[26px] font-black mt-1.5 tabular-nums leading-tight',
                urgent ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white',
              )}>
                {value}
              </p>
            )
          }
          {!loading && (deltaText != null ? (
            <p className={cn(
              'text-xs mt-1 flex items-center gap-1 font-semibold',
              trend === 'up'   ? 'text-emerald-600 dark:text-emerald-400' :
              trend === 'down' ? 'text-red-500 dark:text-red-400' :
                                 'text-slate-400 dark:text-slate-500',
            )}>
              {trend === 'up'   && <TrendingUp className="h-3 w-3 shrink-0" aria-hidden />}
              {trend === 'down' && <TrendingDown className="h-3 w-3 shrink-0" aria-hidden />}
              {deltaText}
            </p>
          ) : sub ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{sub}</p>
          ) : null)}
        </div>
        <div className={cn('flex-shrink-0 rounded-2xl p-3 group-hover:scale-110 transition-transform motion-safe:transition-transform', iconBg)}>
          <Icon className={cn('h-5 w-5', accentColor)} aria-hidden />
        </div>
      </div>
    </PCard>
  )

  if (href) return <Link href={href} className="block" aria-label={`${label}: ${value}`}>{inner}</Link>
  return inner
}

// ── Grid of 4 KPI cards ───────────────────────────────────────────────────────

interface Props {
  today: OwnerSummaryData['today'] | undefined
  ops: DashboardOverview['repairOps'] | undefined
  weeklyRevenue: DashboardOverview['weeklyRevenue'] | undefined
  health: OwnerSummaryData['health'] | undefined
  loading: boolean
}

export function OwnerKpiGrid({ today, ops, weeklyRevenue, health, loading }: Props) {
  const revDelta = computeRevenueDelta(weeklyRevenue)

  const netProfitPct = today && today.totalRevenue > 0
    ? Math.round((today.netProfit / today.totalRevenue) * 100)
    : null

  const profitTrend: 'up' | 'down' | null =
    netProfitPct === null ? null : netProfitPct >= 15 ? 'up' : netProfitPct < 0 ? 'down' : null

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" role="list" aria-label="ตัวชี้วัดหลักวันนี้">
      {/* Revenue */}
      <div role="listitem">
        <KpiCard
          label="รายรับวันนี้"
          value={loading ? '...' : formatThaiMoney(today?.totalRevenue ?? 0)}
          sub={today ? `ขาย ${formatThaiMoney(today.salesRevenue)} · ซ่อม ${formatThaiMoney(today.repairRevenue)}` : undefined}
          deltaText={revDelta !== null
            ? `${revDelta > 0 ? '+' : ''}${revDelta}% จากเมื่อวาน`
            : null}
          trend={revDelta !== null ? (revDelta >= 0 ? 'up' : 'down') : null}
          icon={Banknote}
          accentColor="text-emerald-600 dark:text-emerald-400"
          iconBg="bg-emerald-50 dark:bg-emerald-900/20"
          loading={loading}
          href="/reports/daily-closing"
        />
      </div>

      {/* Net profit */}
      <div role="listitem">
        <KpiCard
          label="กำไรสุทธิวันนี้"
          value={loading ? '...' : formatThaiMoney(today?.netProfit ?? 0)}
          deltaText={netProfitPct !== null ? `margin ${netProfitPct}%` : null}
          trend={profitTrend}
          icon={TrendingUp}
          accentColor={
            netProfitPct === null ? 'text-blue-600 dark:text-blue-400' :
            netProfitPct < 0      ? 'text-red-500' :
            netProfitPct < 15     ? 'text-amber-600 dark:text-amber-400' :
                                    'text-blue-600 dark:text-blue-400'
          }
          iconBg={
            netProfitPct !== null && netProfitPct < 0
              ? 'bg-red-50 dark:bg-red-900/20'
              : 'bg-blue-50 dark:bg-blue-900/20'
          }
          urgent={netProfitPct !== null && netProfitPct < 0}
          loading={loading}
          href="/reports/profit"
        />
      </div>

      {/* Open repairs */}
      <div role="listitem">
        <KpiCard
          label="งานซ่อมเปิดอยู่"
          value={loading ? '...' : String(ops?.openRepairs ?? 0)}
          sub={(ops?.overdueRepairs ?? 0) > 0
            ? `เกินกำหนด ${ops!.overdueRepairs} งาน`
            : 'ทุกงานยังในกำหนด'}
          icon={Wrench}
          accentColor="text-purple-600 dark:text-purple-400"
          iconBg="bg-purple-50 dark:bg-purple-900/20"
          urgent={(ops?.overdueRepairs ?? 0) > 0}
          loading={loading}
          href="/repairs"
        />
      </div>

      {/* Ready for pickup */}
      <div role="listitem">
        <KpiCard
          label="รอรับสินค้า"
          value={loading ? '...' : String(ops?.completedNotDelivered ?? 0)}
          sub={(ops?.completedNotDelivered ?? 0) > 0 ? 'รอลูกค้ามารับ' : 'ส่งคืนครบแล้ว'}
          icon={CheckCircle2}
          accentColor="text-teal-600 dark:text-teal-400"
          iconBg="bg-teal-50 dark:bg-teal-900/20"
          loading={loading}
          href="/repairs?status=READY_PICKUP"
        />
      </div>
    </div>
  )
}
