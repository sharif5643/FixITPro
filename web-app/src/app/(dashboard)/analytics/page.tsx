'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle, TrendingUp, Package, Wrench, Users,
  Building2, BarChart2, ArrowRight, RefreshCw, Filter,
  Clock, Banknote, ChevronDown, ChevronUp, Info,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatThaiMoney } from '@/lib/utils'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AnalyticsOverview {
  deadStockSummary:   { totalItems: number; totalCostValue: number }
  repairAging:        { total: number; critical: number; warning: number }
  profitSummary30d:   { totalRevenue: number; totalCost: number; grossProfit: number; margin: number }
  branchRisks:        Array<{ branchId: string; name: string; riskScore: number; issues: string[] }>
}

interface DeadStockItem {
  product:           { id: string; name: string; sku: string }
  branch:            { id: string; name: string }
  quantity:          number
  costValue:         number
  daysSinceLastSold: number | null
  suggestedAction:   'NEVER_SOLD' | 'DISCOUNT_OR_RETURN' | 'PROMOTE' | 'MONITOR'
}

interface BranchStockItem {
  product:            { id: string; name: string; sku: string; minStock: number }
  totalQuantity:      number
  byBranch:           Array<{ branchId: string; name: string; quantity: number; status: string }>
  transferSuggestion: string | null
}

interface RepairAgingResponse {
  buckets: {
    fresh:    { label: string; severity: string; count: number; items: AgingRepair[] }
    moderate: { label: string; severity: string; count: number; items: AgingRepair[] }
    old:      { label: string; severity: string; count: number; items: AgingRepair[] }
    critical: { label: string; severity: string; count: number; items: AgingRepair[] }
  }
  totalOpen:     number
  criticalCount: number
}

interface AgingRepair {
  id: string; ticketNumber: string; deviceBrand: string; deviceModel: string
  status: string; receivedAt: string
  customer?: { name: string; phone?: string } | null
  technician?: { name: string } | null
}

interface ProfitProduct {
  product:      { id: string; name: string; sku: string }
  soldQty:      number
  revenue:      number
  cost:         number
  grossProfit:  number
  margin:       number
}

interface TechnicianTrend {
  technician:          { id: string; name: string }
  totalRepairs:        number
  completedRepairs:    number
  claimCount:          number
  claimRate:           number
  avgRepairTimeHours:  number | null
  revenue:             number
  repeatRepairSignal:  number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysSinceText(days: number | null): string {
  if (days === null) return 'ไม่เคยขาย'
  if (days > 90) return `${days} วัน`
  if (days > 60) return `${days} วัน`
  return `${days} วัน`
}

function actionBadge(action: string) {
  const map: Record<string, { label: string; cls: string }> = {
    NEVER_SOLD:         { label: 'ไม่เคยขาย',      cls: 'bg-red-100 text-red-700 border-red-200' },
    DISCOUNT_OR_RETURN: { label: 'ลดราคา/คืนสินค้า', cls: 'bg-red-50 text-red-600 border-red-100' },
    PROMOTE:            { label: 'โปรโมต',           cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    MONITOR:            { label: 'ติดตาม',           cls: 'bg-blue-50 text-blue-600 border-blue-200' },
  }
  const v = map[action] ?? { label: action, cls: 'bg-slate-100 text-slate-600' }
  return <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold', v.cls)}>{v.label}</span>
}

const severityCls: Record<string, string> = {
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-amber-100 text-amber-700',
  orange: 'bg-orange-100 text-orange-700',
  red:    'bg-red-100 text-red-700',
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded bg-slate-200 dark:bg-slate-700/60', className)} />
}

function SectionSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, count, colorClass = 'text-slate-700' }: {
  icon: React.ElementType; title: string; count?: number; colorClass?: string
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon className={cn('h-5 w-5', colorClass)} />
      <h2 className={cn('font-bold text-base', colorClass)}>{title}</h2>
      {count !== undefined && (
        <span className="ml-auto text-xs font-semibold text-slate-500 bg-slate-100 rounded-full px-2 py-0.5">
          {count} รายการ
        </span>
      )}
    </div>
  )
}

// ── Overview cards ────────────────────────────────────────────────────────────

function OverviewCards({ data, loading }: { data?: AnalyticsOverview; loading: boolean }) {
  const cards = [
    {
      label:    'เงินจมสต็อก',
      value:    data ? formatThaiMoney(data.deadStockSummary.totalCostValue) : '—',
      sub:      data ? `${data.deadStockSummary.totalItems} รายการ` : '',
      icon:     Package,
      bg:       'bg-orange-500',
      urgent:   data ? data.deadStockSummary.totalCostValue > 50000 : false,
    },
    {
      label:    'งานซ่อมค้าง 7+ วัน',
      value:    data ? String(data.repairAging.critical) : '—',
      sub:      data ? `รวม ${data.repairAging.total} งานเปิด` : '',
      icon:     Wrench,
      bg:       'bg-red-500',
      urgent:   data ? data.repairAging.critical > 0 : false,
    },
    {
      label:    'กำไรขั้นต้น (30 วัน)',
      value:    data ? formatThaiMoney(data.profitSummary30d.grossProfit) : '—',
      sub:      data ? `margin ${data.profitSummary30d.margin}%` : '',
      icon:     TrendingUp,
      bg:       data && data.profitSummary30d.margin >= 20 ? 'bg-emerald-500' : 'bg-amber-500',
      urgent:   false,
    },
    {
      label:    'สาขาที่มีความเสี่ยง',
      value:    data ? String(data.branchRisks.filter((b) => b.riskScore > 0).length) : '—',
      sub:      data ? `จาก ${data.branchRisks.length} สาขา` : '',
      icon:     Building2,
      bg:       'bg-purple-500',
      urgent:   false,
    },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <Card key={c.label} className={cn('border transition-colors', c.urgent ? 'border-red-300 bg-red-50' : 'border-slate-200')}>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-medium truncate', c.urgent ? 'text-red-600' : 'text-slate-500')}>
                  {c.label}
                </p>
                {loading
                  ? <Skeleton className="h-7 w-20 mt-1" />
                  : <p className={cn('text-xl font-bold mt-1', c.urgent ? 'text-red-700' : 'text-slate-900')}>{c.value}</p>
                }
                {c.sub && !loading && <p className="text-xs text-slate-400 mt-0.5">{c.sub}</p>}
              </div>
              <div className={cn('rounded-xl p-2 flex-shrink-0', c.bg)}>
                <c.icon className="h-4 w-4 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ── Dead stock section ────────────────────────────────────────────────────────

function DeadStockSection({
  data, loading, days, onDaysChange,
}: {
  data?: DeadStockItem[]; loading: boolean; days: number; onDaysChange: (d: number) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const display = expanded ? (data ?? []) : (data ?? []).slice(0, 8)

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            <CardTitle className="text-base">สินค้าค้างสต็อก</CardTitle>
            {data && <span className="text-xs text-slate-400 font-normal">({data.length} รายการ)</span>}
          </div>
          <div className="flex items-center gap-1">
            {[30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => onDaysChange(d)}
                className={cn(
                  'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                  days === d
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {d} วัน
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <SectionSkeleton />
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <Package className="h-8 w-8 opacity-30" />
            <p className="text-sm">ไม่มีสินค้าค้างสต็อก</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-slate-500">
                    <th className="text-left py-2 font-semibold">สินค้า</th>
                    <th className="text-left py-2 font-semibold">สาขา</th>
                    <th className="text-right py-2 font-semibold">จำนวน</th>
                    <th className="text-right py-2 font-semibold">มูลค่าทุน</th>
                    <th className="text-right py-2 font-semibold">ค้างมา</th>
                    <th className="text-right py-2 font-semibold">แนะนำ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {display.map((item, i) => (
                    <tr key={`${item.product.id}-${item.branch.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="py-2 pr-2">
                        <p className="font-medium text-slate-900 truncate max-w-[150px]">{item.product.name}</p>
                        <p className="text-[10px] text-slate-400">{item.product.sku}</p>
                      </td>
                      <td className="py-2 pr-2 text-xs text-slate-600 whitespace-nowrap">{item.branch.name}</td>
                      <td className="py-2 text-right font-mono text-sm">{item.quantity}</td>
                      <td className="py-2 text-right text-sm font-semibold text-slate-700">{formatThaiMoney(item.costValue)}</td>
                      <td className="py-2 text-right text-xs text-slate-500">{daysSinceText(item.daysSinceLastSold)}</td>
                      <td className="py-2 text-right">{actionBadge(item.suggestedAction)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {data.length > 8 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="mt-2 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? 'แสดงน้อยลง' : `ดูทั้งหมด ${data.length} รายการ`}
              </button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Branch stock section ──────────────────────────────────────────────────────

function BranchStockSection({ data, loading }: { data?: BranchStockItem[]; loading: boolean }) {
  const withIssues = useMemo(
    () => (data ?? []).filter((item) =>
      item.byBranch.some((b) => b.status !== 'NORMAL') || item.transferSuggestion,
    ),
    [data],
  )

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-blue-500" />
          <CardTitle className="text-base">เปรียบเทียบสต็อกสาขา</CardTitle>
          {data && <span className="text-xs text-slate-400 font-normal">({withIssues.length} รายการที่มีปัญหา)</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <SectionSkeleton />
        ) : withIssues.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <Building2 className="h-8 w-8 opacity-30" />
            <p className="text-sm">สต็อกทุกสาขาอยู่ในระดับปกติ</p>
          </div>
        ) : (
          <div className="space-y-3">
            {withIssues.slice(0, 20).map((item) => (
              <div key={item.product.id} className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <p className="font-medium text-sm text-slate-900">{item.product.name}</p>
                    <p className="text-xs text-slate-400">{item.product.sku} · รวม {item.totalQuantity} ชิ้น</p>
                  </div>
                  {item.transferSuggestion && (
                    <span className="flex items-center gap-1 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                      <ArrowRight className="h-2.5 w-2.5" />
                      {item.transferSuggestion}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {item.byBranch.map((b) => (
                    <span
                      key={b.branchId}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium border',
                        b.status === 'STOCKOUT' ? 'bg-red-50 text-red-700 border-red-100' :
                        b.status === 'LOW'      ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                  'bg-green-50 text-green-700 border-green-100',
                      )}
                    >
                      {b.name}: {b.quantity}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Repair aging section ──────────────────────────────────────────────────────

function RepairAgingSection({ data, loading }: { data?: RepairAgingResponse; loading: boolean }) {
  const [openBucket, setOpenBucket] = useState<string | null>(null)

  const bucketEntries = data
    ? (['fresh', 'moderate', 'old', 'critical'] as const).map((key) => ({
        key, ...data.buckets[key],
      }))
    : []

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-purple-500" />
          <CardTitle className="text-base">งานซ่อมค้าง</CardTitle>
          {data && (
            <span className="text-xs text-slate-400 font-normal">
              ({data.totalOpen} งานเปิด)
            </span>
          )}
          {data && data.criticalCount > 0 && (
            <span className="ml-auto flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
              <AlertTriangle className="h-3 w-3" />
              {data.criticalCount} วิกฤต
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <SectionSkeleton />
        ) : !data || data.totalOpen === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <Wrench className="h-8 w-8 opacity-30" />
            <p className="text-sm">ไม่มีงานซ่อมค้าง</p>
          </div>
        ) : (
          <>
            {/* Summary bar */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {bucketEntries.map((b) => (
                <button
                  key={b.key}
                  onClick={() => setOpenBucket(openBucket === b.key ? null : b.key)}
                  className={cn(
                    'rounded-xl p-3 text-center border transition-colors',
                    openBucket === b.key ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-600' : 'border-slate-100 dark:border-slate-700/60 hover:border-slate-200 dark:hover:border-slate-600',
                  )}
                >
                  <p className={cn('text-2xl font-bold', severityCls[b.severity].split(' ')[1]?.replace('text-', 'text-') ?? 'text-slate-700')}>
                    {b.count}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">{b.label}</p>
                  <span className={cn('inline-block h-1.5 w-6 rounded-full mt-1', {
                    'bg-green-400': b.severity === 'green',
                    'bg-amber-400': b.severity === 'yellow',
                    'bg-orange-400': b.severity === 'orange',
                    'bg-red-500':   b.severity === 'red',
                  })} />
                </button>
              ))}
            </div>

            {/* Expanded bucket list */}
            {openBucket && (() => {
              const bucket = data.buckets[openBucket as keyof typeof data.buckets]
              return bucket.items.length > 0 ? (
                <div className="border border-slate-100 dark:border-slate-700/60 rounded-xl divide-y divide-slate-50 dark:divide-slate-700/40">
                  {bucket.items.map((r) => (
                    <div key={r.id} className="flex items-start gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-blue-700">{r.ticketNumber}</span>
                          <span className="text-xs text-slate-500 truncate">
                            {r.deviceBrand} {r.deviceModel}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 truncate mt-0.5">{r.customer?.name}</p>
                      </div>
                      {r.technician && (
                        <span className="text-xs text-purple-700 bg-purple-50 border border-purple-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                          {r.technician.name}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null
            })()}
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ── Top profit products section ───────────────────────────────────────────────

function TopProfitSection({ data, loading }: { data?: ProfitProduct[]; loading: boolean }) {
  const maxProfit = useMemo(() => Math.max(...(data ?? []).map((p) => p.grossProfit), 1), [data])

  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          <CardTitle className="text-base">สินค้ากำไรสูง</CardTitle>
          {data && <span className="text-xs text-slate-400 font-normal">(top {Math.min(data.length, 20)})</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <SectionSkeleton />
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <TrendingUp className="h-8 w-8 opacity-30" />
            <p className="text-sm">ไม่มีข้อมูลยอดขายในช่วงนี้</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.slice(0, 20).map((item, idx) => (
              <div key={item.product.id} className="flex items-center gap-3">
                <span className="w-5 text-xs text-slate-400 font-mono text-center">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <p className="text-xs font-medium text-slate-900 truncate">{item.product.name}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-slate-500">{item.margin}%</span>
                      <span className="text-xs font-semibold text-emerald-700">{formatThaiMoney(item.grossProfit)}</span>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${(item.grossProfit / maxProfit) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Technician trends section ─────────────────────────────────────────────────

function TechnicianSection({ data, loading }: { data?: TechnicianTrend[]; loading: boolean }) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-violet-500" />
          <CardTitle className="text-base">แนวโน้มช่าง</CardTitle>
          {data && <span className="text-xs text-slate-400 font-normal">({data.length} คน)</span>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <SectionSkeleton />
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <Users className="h-8 w-8 opacity-30" />
            <p className="text-sm">ไม่มีข้อมูลช่างในช่วงนี้</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((tech) => (
              <div key={tech.technician.id} className="rounded-xl border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-violet-100 text-violet-700 font-bold text-sm">
                      {tech.technician.name.charAt(0).toUpperCase()}
                    </span>
                    <div>
                      <p className="font-semibold text-sm text-slate-900">{tech.technician.name}</p>
                      <p className="text-xs text-slate-400">{tech.completedRepairs}/{tech.totalRepairs} งานเสร็จ</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-emerald-700">{formatThaiMoney(tech.revenue)}</p>
                    <p className="text-xs text-slate-400">รายรับ</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {tech.avgRepairTimeHours !== null && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-0.5">
                      เฉลี่ย {tech.avgRepairTimeHours}h
                    </span>
                  )}
                  {tech.claimCount > 0 && (
                    <span className="text-[10px] bg-red-50 text-red-700 border border-red-100 rounded-full px-2 py-0.5">
                      claim {tech.claimCount} งาน ({tech.claimRate}%)
                    </span>
                  )}
                  {tech.repeatRepairSignal > 0 && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-100 rounded-full px-2 py-0.5">
                      ลูกค้ากลับซ้ำ {tech.repeatRepairSignal} ราย
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Branch risk section ───────────────────────────────────────────────────────

function BranchRiskSection({ data, loading }: { data?: AnalyticsOverview['branchRisks']; loading: boolean }) {
  return (
    <Card className="border-slate-200">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-base">ภาพรวมความเสี่ยงสาขา</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <SectionSkeleton />
        ) : !data || data.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
            <Building2 className="h-8 w-8 opacity-30" />
            <p className="text-sm">ไม่มีข้อมูลสาขา</p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.map((b) => (
              <div key={b.branchId} className={cn(
                'flex items-start gap-3 rounded-xl border p-3',
                b.riskScore > 3 ? 'border-red-100 bg-red-50' :
                b.riskScore > 1 ? 'border-amber-100 bg-amber-50' :
                                  'border-green-100 bg-green-50',
              )}>
                <div className={cn(
                  'flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold',
                  b.riskScore > 3 ? 'bg-red-200 text-red-700' :
                  b.riskScore > 1 ? 'bg-amber-200 text-amber-700' :
                                    'bg-green-200 text-green-700',
                )}>
                  {b.riskScore}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-slate-900">{b.name}</p>
                  {b.issues.length === 0 ? (
                    <p className="text-xs text-green-600">ปกติ</p>
                  ) : (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {b.issues.map((issue) => (
                        <span key={issue} className="text-[10px] bg-white/60 text-slate-700 rounded px-1.5 py-0.5">
                          {issue}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ── Date range picker ─────────────────────────────────────────────────────────

function DateRangePicker({
  startDate, endDate, onStartChange, onEndChange,
}: {
  startDate: string; endDate: string
  onStartChange: (v: string) => void; onEndChange: (v: string) => void
}) {
  return (
    <div className="flex items-center gap-2">
      <Filter className="h-4 w-4 text-slate-400 shrink-0" />
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-300"
      />
      <span className="text-xs text-slate-400">—</span>
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-2 py-1 text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:border-blue-300"
      />
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnalyticsPage() {
  const user     = useAuthStore((s) => s.user)
  const isOwner  = user?.role === 'OWNER' || user?.role === 'SUPER_ADMIN'
  const { branchId: contextBranchId } = useBranchContext()

  const thaiNow  = new Date(Date.now() + 7 * 3_600_000)
  const todayStr = thaiNow.toISOString().slice(0, 10)
  const monthAgo = new Date(Date.now() - 30 * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10)

  const [deadStockDays, setDeadStockDays] = useState(30)
  const [startDate, setStartDate]         = useState(monthAgo)
  const [endDate, setEndDate]             = useState(todayStr)

  const qparams = useMemo(() => {
    const p: Record<string, string> = {}
    if (contextBranchId) p.branchId = contextBranchId
    return p
  }, [contextBranchId])

  const overviewQ = useQuery<AnalyticsOverview>({
    queryKey: ['analytics-overview', qparams],
    queryFn:  () => api.get('/analytics/overview', { params: qparams }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  const deadStockQ = useQuery<DeadStockItem[]>({
    queryKey: ['analytics-dead-stock', qparams, deadStockDays],
    queryFn:  () => api.get('/analytics/dead-stock', { params: { ...qparams, days: deadStockDays } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  const branchStockQ = useQuery<BranchStockItem[]>({
    queryKey: ['analytics-branch-stock', qparams],
    queryFn:  () => api.get('/analytics/branch-stock', { params: qparams }).then((r) => r.data),
    staleTime: 5 * 60_000,
    enabled: isOwner,
  })

  const repairAgingQ = useQuery<RepairAgingResponse>({
    queryKey: ['analytics-repair-aging', qparams],
    queryFn:  () => api.get('/analytics/repair-aging', { params: qparams }).then((r) => r.data),
    staleTime: 2 * 60_000,
  })

  const profitQ = useQuery<ProfitProduct[]>({
    queryKey: ['analytics-profit', qparams, startDate, endDate],
    queryFn:  () => api.get('/analytics/top-profit-products', {
      params: { ...qparams, startDate, endDate },
    }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  const techQ = useQuery<TechnicianTrend[]>({
    queryKey: ['analytics-tech', qparams, startDate, endDate],
    queryFn:  () => api.get('/analytics/technician-trends', {
      params: { ...qparams, startDate, endDate },
    }).then((r) => r.data),
    staleTime: 5 * 60_000,
  })

  function refetchAll() {
    overviewQ.refetch()
    deadStockQ.refetch()
    branchStockQ.refetch()
    repairAgingQ.refetch()
    profitQ.refetch()
    techQ.refetch()
  }

  return (
    <div className="flex flex-col min-h-full bg-[#F8FAFC] dark:bg-[#0F172A]">
      <BranchContextBar />

      <div className="bg-white dark:bg-[#1E293B] border-b border-slate-200 dark:border-slate-700/60 px-4 pb-2">
        <PageHeader
          title="วิเคราะห์เชิงลึก"
          icon={BarChart2}
          subtitle="ภาพรวมธุรกิจ · สต็อก · งานซ่อม · ผลกำไร"
          primaryAction={
            <div className="flex items-center gap-2">
              <DateRangePicker startDate={startDate} endDate={endDate} onStartChange={setStartDate} onEndChange={setEndDate} />
              <Button size="sm" variant="outline" onClick={refetchAll} className="gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" />
                รีเฟรช
              </Button>
            </div>
          }
        />
      </div>

      {/* Content */}
      <div className="flex-1 p-4 space-y-4 max-w-screen-2xl mx-auto w-full">

        {/* Overview stat cards */}
        <OverviewCards data={overviewQ.data} loading={overviewQ.isLoading} />

        {/* Bento grid — upper row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RepairAgingSection data={repairAgingQ.data} loading={repairAgingQ.isLoading} />
          {isOwner && (
            <BranchRiskSection
              data={overviewQ.data?.branchRisks}
              loading={overviewQ.isLoading}
            />
          )}
        </div>

        {/* Dead stock — full width */}
        <DeadStockSection
          data={deadStockQ.data}
          loading={deadStockQ.isLoading}
          days={deadStockDays}
          onDaysChange={setDeadStockDays}
        />

        {/* Branch stock — owner only */}
        {isOwner && (
          <BranchStockSection data={branchStockQ.data} loading={branchStockQ.isLoading} />
        )}

        {/* Lower bento row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TopProfitSection data={profitQ.data} loading={profitQ.isLoading} />
          <TechnicianSection data={techQ.data} loading={techQ.isLoading} />
        </div>

      </div>
    </div>
  )
}
