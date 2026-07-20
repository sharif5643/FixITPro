'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { format, subDays, startOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Wrench, Trophy, TrendingUp, Clock, ShieldAlert, RotateCcw,
  XCircle, Loader2, ChevronRight, Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { TechnicianSummary } from '@/types'

// ── Date preset helpers ───────────────────────────────────────────────────────

type Preset = '7d' | '30d' | 'month' | 'all'

function getPresetDates(preset: Preset): { startDate: string; endDate: string } | {} {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (preset === '7d')    return { startDate: fmt(subDays(today, 6)), endDate: fmt(today) }
  if (preset === '30d')   return { startDate: fmt(subDays(today, 29)), endDate: fmt(today) }
  if (preset === 'month') return { startDate: fmt(startOfMonth(today)), endDate: fmt(today) }
  return {}
}

// ── KPI badge helpers ─────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>
  if (rank === 2) return <span className="text-lg">🥈</span>
  if (rank === 3) return <span className="text-lg">🥉</span>
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300">
      {rank}
    </span>
  )
}

function ClaimRatePip({ rate }: { rate: number }) {
  const cls = rate >= 20
    ? 'bg-red-100 text-red-700 border-red-200'
    : rate >= 10
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-green-100 text-green-700 border-green-200'
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      <ShieldAlert className="h-2.5 w-2.5" />
      {rate.toFixed(1)}%
    </span>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function TechniciansPage() {
  const router = useRouter()
  const [preset, setPreset]       = useState<Preset>('30d')
  const [customStart, setStart]   = useState('')
  const [customEnd,   setEnd]     = useState('')

  const dateParams = customStart || customEnd
    ? { startDate: customStart || undefined, endDate: customEnd || undefined }
    : getPresetDates(preset)

  const { data: techs = [], isLoading } = useQuery<TechnicianSummary[]>({
    queryKey: ['technicians', dateParams],
    queryFn:  async () => (await api.get('/technicians', { params: dateParams })).data,
    placeholderData: (prev) => prev,
  })

  // Summary totals
  const totals = techs.reduce(
    (acc, t) => ({
      revenue:   acc.revenue   + t.kpi.revenue,
      completed: acc.completed + t.kpi.completedRepairs,
      total:     acc.total     + t.kpi.totalRepairs,
    }),
    { revenue: 0, completed: 0, total: 0 },
  )

  const PRESETS: { key: Preset; label: string }[] = [
    { key: '7d',    label: '7 วัน' },
    { key: '30d',   label: '30 วัน' },
    { key: 'month', label: 'เดือนนี้' },
    { key: 'all',   label: 'ทั้งหมด' },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="ประสิทธิภาพช่างซ่อม"
        icon={Wrench}
        subtitle="KPI และสถิติการทำงานของช่างซ่อมทุกคน"
      />

      {/* Date filter */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              onClick={() => { setPreset(p.key); setStart(''); setEnd('') }}
              className={[
                'rounded-full px-3 py-1 text-xs font-semibold transition-all border',
                (!customStart && !customEnd) && preset === p.key
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:border-slate-400 dark:hover:border-slate-500',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">กำหนดเอง:</span>
          <Input
            type="date"
            value={customStart}
            onChange={(e) => setStart(e.target.value)}
            className="h-8 text-sm w-36"
          />
          <span className="text-xs text-muted-foreground">—</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => setEnd(e.target.value)}
            className="h-8 text-sm w-36"
          />
          {(customStart || customEnd) && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setStart(''); setEnd('') }}
            >
              ล้าง
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-blue-500" />
            <p className="text-xs text-muted-foreground">ช่างซ่อมทั้งหมด</p>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{techs.length}</p>
        </div>
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="h-4 w-4 text-green-500" />
            <p className="text-xs text-muted-foreground">งานซ่อมสำเร็จ</p>
          </div>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{totals.completed}</p>
          <p className="text-xs text-muted-foreground">จาก {totals.total} งาน</p>
        </div>
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-purple-500" />
            <p className="text-xs text-muted-foreground">รายได้รวม</p>
          </div>
          <p className="text-xl font-bold text-purple-700 tabular-nums">
            {formatThaiMoney(totals.revenue)}
          </p>
        </div>
      </div>

      {/* Leaderboard table — desktop */}
      <div className="hidden md:block bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : techs.length === 0 ? (
          <EmptyState preset="technicians" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="text-center px-3 py-3 font-medium w-12">อันดับ</th>
                  <th className="text-left px-4 py-3 font-medium">ช่าง</th>
                  <th className="text-center px-4 py-3 font-medium">งานทั้งหมด</th>
                  <th className="text-center px-4 py-3 font-medium">สำเร็จ</th>
                  <th className="text-center px-4 py-3 font-medium">ยกเลิก%</th>
                  <th className="text-center px-4 py-3 font-medium">เวลาเฉลี่ย</th>
                  <th className="text-right px-4 py-3 font-medium">รายได้</th>
                  <th className="text-right px-4 py-3 font-medium">ค่าแรง</th>
                  <th className="text-center px-4 py-3 font-medium">เคลม%</th>
                  <th className="text-center px-4 py-3 font-medium">ซ่อมซ้ำ</th>
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody>
                {techs.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b last:border-0 hover:bg-blue-50/40 transition-colors cursor-pointer"
                    onClick={() => router.push(`/technicians/${t.id}`)}
                  >
                    <td className="px-3 py-3 text-center">
                      <RankBadge rank={t.rank ?? 0} />
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900 dark:text-white">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.phone ?? t.email}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold">{t.kpi.totalRepairs}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="font-semibold text-green-700">{t.kpi.completedRepairs}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={t.kpi.cancellationRate >= 15 ? 'text-red-600 font-semibold' : 'text-slate-600 dark:text-slate-400'}>
                        {t.kpi.cancellationRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-600 dark:text-slate-400">
                      {t.kpi.avgRepairHours != null
                        ? t.kpi.avgRepairHours < 24
                          ? `${t.kpi.avgRepairHours.toFixed(1)} ชม.`
                          : `${(t.kpi.avgRepairHours / 24).toFixed(1)} วัน`
                        : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-purple-700">
                      {formatThaiMoney(t.kpi.revenue)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-sm text-slate-700 dark:text-slate-300">
                      {formatThaiMoney(t.kpi.laborRevenue)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <ClaimRatePip rate={t.kpi.warrantyClaimRate} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.kpi.repeatRepairs > 0 ? (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                          <RotateCcw className="h-2.5 w-2.5" />
                          {t.kpi.repeatRepairs}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : techs.length === 0 ? (
          <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)]">
            <EmptyState preset="technicians" />
          </div>
        ) : (
          techs.map((t) => (
            <div
              key={t.id}
              className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-3"
              onClick={() => router.push(`/technicians/${t.id}`)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <RankBadge rank={t.rank ?? 0} />
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.phone ?? '—'}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500 mt-1" />
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-slate-50 py-2">
                  <p className="text-[10px] text-muted-foreground">งานทั้งหมด</p>
                  <p className="font-bold text-sm">{t.kpi.totalRepairs}</p>
                </div>
                <div className="rounded-lg bg-green-50 py-2">
                  <p className="text-[10px] text-green-600">สำเร็จ</p>
                  <p className="font-bold text-sm text-green-700">{t.kpi.completedRepairs}</p>
                </div>
                <div className="rounded-lg bg-purple-50 py-2">
                  <p className="text-[10px] text-purple-600">รายได้</p>
                  <p className="font-bold text-xs text-purple-700 tabular-nums">
                    {formatThaiMoney(t.kpi.revenue)}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-400">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {t.kpi.avgRepairHours != null
                    ? t.kpi.avgRepairHours < 24
                      ? `${t.kpi.avgRepairHours.toFixed(1)} ชม.`
                      : `${(t.kpi.avgRepairHours / 24).toFixed(1)} วัน`
                    : '—'}
                </span>
                <ClaimRatePip rate={t.kpi.warrantyClaimRate} />
                {t.kpi.cancellationRate >= 15 && (
                  <span className="flex items-center gap-0.5 text-red-600">
                    <XCircle className="h-3 w-3" />
                    {t.kpi.cancellationRate.toFixed(1)}% ยกเลิก
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
