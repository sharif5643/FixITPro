'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, startOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowLeft, Wrench, TrendingUp, Clock, ShieldAlert, RotateCcw,
  XCircle, Loader2, CheckCircle2, Hammer, DollarSign,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { TechnicianDetail, DailyPoint } from '@/types'

// ── Date preset helpers ───────────────────────────────────────────────────────

type Preset = '7d' | '30d' | 'month' | 'all'

function getPresetDates(preset: Preset) {
  const today = new Date()
  const fmt = (d: Date) => format(d, 'yyyy-MM-dd')
  if (preset === '7d')    return { startDate: fmt(subDays(today, 6)),      endDate: fmt(today) }
  if (preset === '30d')   return { startDate: fmt(subDays(today, 29)),     endDate: fmt(today) }
  if (preset === 'month') return { startDate: fmt(startOfMonth(today)),    endDate: fmt(today) }
  return {}
}

// ── SVG Bar Chart ─────────────────────────────────────────────────────────────

function BarChart({
  data,
  valueKey,
  color,
  label,
  formatter = (v: number) => String(v),
}: {
  data: DailyPoint[]
  valueKey: 'repairs' | 'revenue'
  color: string
  label: string
  formatter?: (v: number) => string
}) {
  const W = 600
  const H = 140
  const PAD = { top: 8, right: 8, bottom: 28, left: 8 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-36 text-sm text-muted-foreground bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-700/60 rounded-lg">
        ไม่มีข้อมูล
      </div>
    )
  }

  const values = data.map((d) => d[valueKey] as number)
  const maxVal = Math.max(...values, 1)
  const barW = Math.max(4, (chartW / data.length) * 0.6)
  const gap   = chartW / data.length

  // Show tick labels every N bars
  const showEvery = data.length <= 7 ? 1 : data.length <= 14 ? 2 : Math.ceil(data.length / 7)

  return (
    <div>
      <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: 140 }}
        aria-label={label}
      >
        {/* Y grid lines */}
        {[0.25, 0.5, 0.75, 1].map((f) => {
          const y = PAD.top + chartH * (1 - f)
          return (
            <line
              key={f}
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth="1"
            />
          )
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const val = d[valueKey] as number
          const bh  = Math.max(2, (val / maxVal) * chartH)
          const x   = PAD.left + i * gap + (gap - barW) / 2
          const y   = PAD.top + chartH - bh
          return (
            <g key={d.date}>
              <rect
                x={x}
                y={y}
                width={barW}
                height={bh}
                fill={color}
                rx="2"
                opacity="0.85"
              >
                <title>{`${d.date}: ${formatter(val)}`}</title>
              </rect>
              {i % showEvery === 0 && (
                <text
                  x={x + barW / 2}
                  y={H - 6}
                  textAnchor="middle"
                  fontSize="9"
                  fill="#9ca3af"
                >
                  {d.date.slice(5)} {/* MM-DD */}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// ── Claim Rate Gauge ──────────────────────────────────────────────────────────

function ClaimGauge({ rate }: { rate: number }) {
  const clamped = Math.min(100, rate)
  const color   = rate >= 20 ? '#ef4444' : rate >= 10 ? '#f59e0b' : '#22c55e'
  const label   = rate >= 20 ? 'สูงมาก' : rate >= 10 ? 'ปานกลาง' : 'ดี'

  // Simple horizontal fill bar
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">อัตราเคลม (warranty)</span>
        <span className="text-sm font-bold" style={{ color }}>{rate.toFixed(1)}% — {label}</span>
      </div>
      <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${clamped}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = 'text-slate-900 dark:text-white',
  bg = 'bg-white',
}: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
  color?: string
  bg?: string
}) {
  return (
    <div className={`${bg} rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 bg-white dark:bg-[#1E293B]`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Repair status helpers ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'รับงาน', DIAGNOSING: 'ตรวจสอบ', WAITING_APPROVAL: 'รออนุมัติ',
  APPROVED: 'อนุมัติ', WAITING_PARTS: 'รออะไหล่', IN_PROGRESS: 'กำลังซ่อม',
  COMPLETED: 'ซ่อมเสร็จ', DELIVERED: 'ส่งคืน', CANCELLED: 'ยกเลิก',
}
const STATUS_COLOR: Record<string, string> = {
  DELIVERED:   'bg-slate-100 dark:bg-slate-700/40 text-slate-700 dark:text-slate-300',
  COMPLETED:   'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  CANCELLED:   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  IN_PROGRESS: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function TechnicianProfilePage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()

  const [preset, setPreset]     = useState<Preset>('30d')
  const [customStart, setStart] = useState('')
  const [customEnd,   setEnd]   = useState('')

  const dateParams = customStart || customEnd
    ? { startDate: customStart || undefined, endDate: customEnd || undefined }
    : getPresetDates(preset)

  const { data: tech, isLoading } = useQuery<TechnicianDetail>({
    queryKey: ['technician', id, dateParams],
    queryFn:  async () => (await api.get(`/technicians/${id}`, { params: dateParams })).data,
    enabled:  !!id,
    placeholderData: (prev) => prev,
  })

  if (isLoading && !tech) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }

  if (!tech) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">ไม่พบข้อมูลช่างซ่อม</p>
        <Button variant="outline" onClick={() => router.push('/technicians')}>กลับ</Button>
      </div>
    )
  }

  const kpi = tech.kpi
  const PRESETS: { key: Preset; label: string }[] = [
    { key: '7d', label: '7 วัน' }, { key: '30d', label: '30 วัน' },
    { key: 'month', label: 'เดือนนี้' }, { key: 'all', label: 'ทั้งหมด' },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-8">
      {/* Back */}
      <div className="flex items-center gap-2">
        <Link
          href="/technicians"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-slate-900 dark:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          ช่างซ่อม
        </Link>
      </div>

      {/* Profile header */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-5">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {tech.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">{tech.name}</h1>
            <p className="text-sm text-muted-foreground">{tech.phone ?? tech.email}</p>
            <span className={`inline-block mt-1 rounded-full px-2.5 py-0.5 text-xs font-semibold border ${tech.isActive ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700/60' : 'bg-slate-50 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700/60'}`}>
              {tech.isActive ? 'ใช้งานอยู่' : 'ไม่ใช้งาน'}
            </span>
          </div>
        </div>
      </div>

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
                  : 'bg-white text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700/60 hover:border-slate-400',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">กำหนดเอง:</span>
          <Input type="date" value={customStart} onChange={(e) => setStart(e.target.value)} className="h-8 text-sm w-36" />
          <span className="text-xs text-muted-foreground">—</span>
          <Input type="date" value={customEnd}   onChange={(e) => setEnd(e.target.value)}   className="h-8 text-sm w-36" />
          {(customStart || customEnd) && (
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setStart(''); setEnd('') }}>ล้าง</Button>
          )}
        </div>
      </div>

      {/* KPI cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard icon={Wrench}       label="งานทั้งหมด"   value={String(kpi.totalRepairs)}                       sub={`กำลังซ่อม ${kpi.inProgressRepairs} งาน`} />
        <KpiCard icon={CheckCircle2} label="สำเร็จ"        value={String(kpi.completedRepairs)}                  color="text-green-700" bg="bg-green-50/30" />
        <KpiCard icon={XCircle}      label="ยกเลิก"        value={`${kpi.cancellationRate.toFixed(1)}%`}         color={kpi.cancellationRate >= 15 ? 'text-red-600' : 'text-slate-700 dark:text-slate-300'} sub={`${kpi.cancelledRepairs} งาน`} />
        <KpiCard icon={Clock}        label="เวลาเฉลี่ย"    value={
          kpi.avgRepairHours != null
            ? kpi.avgRepairHours < 24
              ? `${kpi.avgRepairHours.toFixed(1)} ชม.`
              : `${(kpi.avgRepairHours / 24).toFixed(1)} วัน`
            : '—'
        } />
        <KpiCard icon={TrendingUp}   label="รายได้รวม"     value={formatThaiMoney(kpi.revenue)}                  color="text-purple-700" bg="bg-purple-50/30" />
        <KpiCard icon={DollarSign}   label="ค่าแรง"         value={formatThaiMoney(kpi.laborRevenue)}             color="text-blue-700" />
        <KpiCard icon={Hammer}       label="ต้นทุนอะไหล่"  value={formatThaiMoney(kpi.partsCost)}                color="text-slate-700 dark:text-slate-300" />
        <KpiCard icon={RotateCcw}    label="ซ่อมซ้ำ"        value={String(kpi.repeatRepairs)}                     sub="ลูกค้ากลับมา 30 วัน" />
      </div>

      {/* Warranty claim gauge */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-500" />
          อัตราเคลมการรับประกัน
        </h2>
        <ClaimGauge rate={kpi.warrantyClaimRate} />
        <p className="text-xs text-muted-foreground">
          เคลม {kpi.warrantyClaims} ครั้ง จาก {kpi.completedRepairs} งานที่ส่งมอบ
        </p>
      </div>

      {/* Charts */}
      {tech.daily.length > 0 && (
        <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] p-5 space-y-6">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">กราฟรายวัน</h2>
          <BarChart
            data={tech.daily}
            valueKey="repairs"
            color="#3b82f6"
            label="จำนวนงานซ่อมสำเร็จ/วัน"
            formatter={(v) => `${v} งาน`}
          />
          <BarChart
            data={tech.daily}
            valueKey="revenue"
            color="#8b5cf6"
            label="รายได้/วัน (บาท)"
            formatter={(v) => formatThaiMoney(v)}
          />
        </div>
      )}

      {/* Recent repairs table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-100 dark:border-slate-700/60 shadow-[0_2px_8px_rgba(0,0,0,0.06)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.30)] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700/60 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">ประวัติงานซ่อม</h2>
          <span className="text-xs text-muted-foreground">แสดง {tech.recentRepairs.length} รายการ</span>
        </div>

        {tech.recentRepairs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
            <Wrench className="h-8 w-8 opacity-20" />
            <p className="text-sm">ไม่มีงานซ่อมในช่วงเวลานี้</p>
          </div>
        ) : (
          <>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                    <th className="text-left px-4 py-3 font-medium">เลขงาน</th>
                    <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                    <th className="text-left px-4 py-3 font-medium">อุปกรณ์</th>
                    <th className="text-left px-4 py-3 font-medium">สถานะ</th>
                    <th className="text-right px-4 py-3 font-medium">ราคา</th>
                    <th className="text-left px-4 py-3 font-medium">วันรับ</th>
                    <th className="text-left px-4 py-3 font-medium">วันส่ง</th>
                  </tr>
                </thead>
                <tbody>
                  {tech.recentRepairs.map((r) => (
                    <tr key={r.id} className="border-b border-slate-100 dark:border-slate-700/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors">
                      <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">
                        {r.ticketNumber}
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-300">
                        {r.customer?.name ?? '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {r.deviceBrand} {r.deviceModel}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-600 dark:text-slate-400'}`}>
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold text-slate-800 dark:text-slate-100">
                        {r.finalCost ? formatThaiMoney(Number(r.finalCost)) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(r.receivedAt), 'dd/MM/yy', { locale: th })}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                        {r.deliveredAt
                          ? format(new Date(r.deliveredAt), 'dd/MM/yy', { locale: th })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-700/60">
              {tech.recentRepairs.map((r) => (
                <div key={r.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-mono text-xs font-semibold text-blue-700">{r.ticketNumber}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[r.status] ?? 'bg-slate-100 text-slate-600 dark:text-slate-400'}`}>
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-800 dark:text-slate-100">{r.deviceBrand} {r.deviceModel}</p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{r.customer?.name ?? '—'}</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                      {r.finalCost ? formatThaiMoney(Number(r.finalCost)) : '—'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
