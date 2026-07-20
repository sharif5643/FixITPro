'use client'

import Link from 'next/link'
import {
  Wrench, Star, ShieldAlert, ReceiptText,
  AlertTriangle, ChevronRight, ArrowRight,
} from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { Skel, PCard, hoverCard, CardHeader } from './primitives'
import type { DashboardOverview, OwnerSummaryData } from './types'

// ── Repair queue with prioritised status links ────────────────────────────────

const REPAIR_ROWS: { key: keyof DashboardOverview['repairOps']; label: string; color: string; text: string; status?: string }[] = [
  { key: 'overdueRepairs',         label: 'เกินกำหนด',    color: 'bg-red-500',     text: 'text-red-600 dark:text-red-400'     },
  { key: 'inProgress',             label: 'กำลังซ่อม',    color: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400',   status: 'IN_PROGRESS'   },
  { key: 'waitingParts',           label: 'รออะไหล่',     color: 'bg-amber-400',   text: 'text-amber-600 dark:text-amber-400', status: 'WAITING_PARTS' },
  { key: 'completedNotDelivered',  label: 'รอลูกค้ารับ',  color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400', status: 'READY_PICKUP' },
  { key: 'unpaidDebtCount',        label: 'ค้างชำระ',     color: 'bg-rose-500',    text: 'text-rose-600 dark:text-rose-400'   },
  { key: 'waitingApproval',        label: 'รออนุมัติ',    color: 'bg-amber-300',   text: 'text-amber-600 dark:text-amber-400', status: 'WAITING_APPROVAL' },
]

function RepairQueueCard({ ops, loading }: { ops?: DashboardOverview['repairOps']; loading: boolean }) {
  const hasOverdue = (ops?.overdueRepairs ?? 0) > 0
  const rows = REPAIR_ROWS.filter(r => (ops?.[r.key] ?? 0) > 0)

  return (
    <Link href="/repairs" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
      <PCard urgent={hasOverdue} className={cn('p-4 cursor-pointer', hoverCard)}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center h-7 w-7 rounded-xl bg-purple-50 dark:bg-purple-900/20">
              <Wrench className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" aria-hidden />
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">งานซ่อมทั้งหมด</p>
              {loading
                ? <Skel className="h-6 w-10 mt-0.5" />
                : <p className="text-xl font-black text-slate-900 dark:text-white leading-tight">{ops?.openRepairs ?? 0}</p>
              }
            </div>
          </div>
          {hasOverdue && (
            <span className="flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-2 py-0.5 text-[10px] font-bold text-red-600 dark:text-red-400">
              <AlertTriangle className="h-3 w-3" aria-hidden />{ops?.overdueRepairs} เกิน
            </span>
          )}
        </div>
        {loading ? <Skel className="h-16 w-full" /> : (
          <div className="space-y-1.5">
            {rows.map(row => {
              const href = row.status ? `/repairs?status=${row.status}` : '/repairs'
              return (
                <div key={row.key} className="flex items-center gap-2">
                  <span className={cn('inline-block h-2 w-2 rounded-full flex-shrink-0', row.color)} aria-hidden />
                  <span className="text-xs text-slate-500 dark:text-slate-400 flex-1">{row.label}</span>
                  <span className={cn('text-xs font-bold tabular-nums', row.text)}>{ops?.[row.key] ?? 0}</span>
                  {row.status && (
                    <ChevronRight className="h-3 w-3 text-slate-300 dark:text-slate-600 flex-shrink-0" aria-hidden />
                  )}
                </div>
              )
            })}
            {rows.length === 0 && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 text-center py-2 font-semibold">ไม่มีงานค้าง ✓</p>
            )}
          </div>
        )}
      </PCard>
    </Link>
  )
}

// ── Best technician ───────────────────────────────────────────────────────────

function BestTechCard({ techs, loading }: { techs?: DashboardOverview['topTechnicians']; loading: boolean }) {
  const top = techs?.[0]
  return (
    <Link href="/employees" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
      <PCard className={cn('p-4 cursor-pointer group', hoverCard)}>
        <CardHeader
          icon={Star} iconBg="bg-yellow-50 dark:bg-yellow-900/20" iconColor="text-yellow-500"
          title="ช่างยอดเยี่ยม"
        >
          <p className="text-[10px] text-slate-400 dark:text-slate-500 ml-1">วันนี้</p>
          <ChevronRight className="ml-auto h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:translate-x-0.5 transition-transform" aria-hidden />
        </CardHeader>
        {loading ? <Skel className="h-14 w-full" /> : !top ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-3">ยังไม่มีข้อมูล</p>
        ) : (
          <div className="flex items-center gap-3">
            <div
              className="h-10 w-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0 text-white font-black text-sm shadow-sm"
              aria-hidden
            >
              {top.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{top.name}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {top.repairCount} งาน · {formatThaiMoney(top.repairRevenue)}
              </p>
            </div>
          </div>
        )}
      </PCard>
    </Link>
  )
}

// ── Outstanding debt ──────────────────────────────────────────────────────────

function DebtCard({ ops, loading }: { ops?: DashboardOverview['repairOps']; loading: boolean }) {
  const hasDebt = (ops?.unpaidDebtCount ?? 0) > 0
  return (
    <Link href="/repairs" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
      <PCard urgent={hasDebt} className={cn('p-4 cursor-pointer', hoverCard)}>
        <CardHeader
          icon={ShieldAlert} iconBg="bg-rose-50 dark:bg-rose-900/20" iconColor="text-rose-600 dark:text-rose-400"
          title="หนี้ค้างชำระ"
        />
        {loading ? <Skel className="h-14 w-full" /> : (
          <>
            <p className={cn('text-xl font-black tabular-nums', hasDebt ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white')}>
              {formatThaiMoney(ops?.unpaidDebtTotal ?? 0)}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {ops?.unpaidDebtCount ?? 0} งาน{!hasDebt ? ' · ไม่มีหนี้ค้าง' : ''}
            </p>
            {hasDebt && (
              <div className="flex items-center gap-1 mt-2 text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                <ArrowRight className="h-3 w-3" aria-hidden />ดูงานค้างชำระ
              </div>
            )}
          </>
        )}
      </PCard>
    </Link>
  )
}

// ── Today's expenses ──────────────────────────────────────────────────────────

function ExpensesCard({
  today, loading, highExpenses,
}: { today?: OwnerSummaryData['today']; loading: boolean; highExpenses?: boolean }) {
  const ratio = today && today.totalRevenue > 0
    ? Math.min(100, Math.round((today.totalExpenses / today.totalRevenue) * 100))
    : 0

  return (
    <Link href="/expenses" className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-2xl">
      <PCard urgent={highExpenses} className={cn('p-4 cursor-pointer', hoverCard)}>
        <CardHeader
          icon={ReceiptText} iconBg="bg-orange-50 dark:bg-orange-900/20" iconColor="text-orange-600 dark:text-orange-400"
          title="ค่าใช้จ่ายวันนี้"
        />
        {loading ? <Skel className="h-14 w-full" /> : (
          <>
            <p className={cn('text-xl font-black tabular-nums', highExpenses ? 'text-orange-600 dark:text-orange-400' : 'text-slate-900 dark:text-white')}>
              {formatThaiMoney(today?.totalExpenses ?? 0)}
            </p>
            {today && today.totalRevenue > 0 ? (
              <>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{ratio}% ของรายรับ</p>
                <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-700/60 overflow-hidden" role="progressbar" aria-valuenow={ratio} aria-valuemin={0} aria-valuemax={100} aria-label={`ค่าใช้จ่าย ${ratio}% ของรายรับ`}>
                  <div
                    className={cn('h-full rounded-full motion-safe:transition-all motion-safe:duration-500', ratio >= 60 ? 'bg-red-500' : ratio >= 40 ? 'bg-amber-400' : 'bg-emerald-500')}
                    style={{ width: `${ratio}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ยังไม่มีรายรับวันนี้</p>
            )}
          </>
        )}
      </PCard>
    </Link>
  )
}

// ── Operations grid ───────────────────────────────────────────────────────────

interface Props {
  ops: DashboardOverview['repairOps'] | undefined
  techs: DashboardOverview['topTechnicians'] | undefined
  today: OwnerSummaryData['today'] | undefined
  highExpenses: boolean | undefined
  loading: boolean
}

export function OperationsSummary({ ops, techs, today, highExpenses, loading }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <RepairQueueCard ops={ops} loading={loading} />
      <BestTechCard techs={techs} loading={loading} />
      <DebtCard ops={ops} loading={loading} />
      <ExpensesCard today={today} loading={loading} highExpenses={highExpenses} />
    </div>
  )
}
