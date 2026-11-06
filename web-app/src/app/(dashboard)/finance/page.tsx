'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import Link from 'next/link'
import { Wallet, ArrowRight, BarChart2, Receipt, Printer, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { formatThaiMoney } from '@/lib/utils'
import { useBranchContext } from '@/hooks/useBranchContext'
import { BranchContextBar } from '@/components/layout/branch-context-bar'
import { ModuleGate } from '@/components/auth/module-gate'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { MoneyEquation, MoneyLine, SourceCard } from '@/components/reports/money-parts'
import { LEDGER_SOURCE, ledgerLabel, type LedgerKind } from '@/lib/cash-ledger-labels'
import { DrillDrawer } from '@/components/reports/drill-drawer'
import { TrailList } from '@/components/money/trail'
import type { DocRef } from '@/components/money/doc-peek'

// ── Types ─────────────────────────────────────────────────────────────────────

interface FinanceSummary {
  period:   { startDate: string; endDate: string }
  totalIn:  number
  totalOut: number
  net:      number
  txnCount: number
  bySource: Record<string, { in: number; out: number }>
}

// ── Helpers ───────────────────────────────────────────────────────────────────


const PRESET_RANGES = [
  { label: 'วันนี้',      days: 0 },
  { label: '7 วัน',      days: 7 },
  { label: '30 วัน',     days: 30 },
] as const

function toDate(d: Date) { return format(d, 'yyyy-MM-dd') }

// ── Lines of money in / out, with how much of the total each is ─────────────

const KIND_NOTE: Record<LedgerKind, string> = {
  income: '',
  cost:   '',
  refund: 'คืนลูกค้า',
  owner:  'ไม่ใช่กำไร/ค่าใช้จ่าย',
}

function LedgerLines({ rows, total, tone, onRow }: { rows: { src: string; amount: number }[]; total: number; tone: 'in' | 'out'; onRow?: (src: string, amount: number) => void }) {
  if (rows.length === 0) return <p className="py-2 text-sm text-muted-foreground">ไม่มีรายการ</p>
  return (
    <div className="space-y-2.5">
      {rows.map(({ src, amount }) => {
        const meta = LEDGER_SOURCE[src]
        const pct = total > 0 ? Math.round((amount / total) * 100) : 0
        const note = meta ? KIND_NOTE[meta.kind] : ''
        return (
          <button type="button" key={src} onClick={() => onRow?.(src, amount)} className="group -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-1 text-left hover:bg-blue-50/70 dark:hover:bg-blue-900/20">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="mr-1.5">{meta?.icon ?? '•'}</span>{ledgerLabel(src)}
                {note && <span className="ml-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{note}</span>}
              </span>
              <span className={cn('shrink-0 font-semibold tabular-nums', tone === 'out' && 'text-red-600 dark:text-red-400')}>
                {tone === 'out' ? '− ' : ''}{formatThaiMoney(amount)}
                <ChevronRight className="-mr-1 ml-0.5 inline h-3.5 w-3.5 text-slate-300 group-hover:text-blue-500" />
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className={cn('h-full rounded-full', tone === 'in' ? 'bg-emerald-400' : meta?.kind === 'owner' ? 'bg-slate-300' : 'bg-red-300')} style={{ width: `${Math.max(pct, 2)}%` }} />
            </div>
          </button>
        )
      })}
    </div>
  )
}

/** One kind of money in / out, row by row from the ledger, each linking to its document */
function LedgerTrail({ pick, startDate, endDate, branchId, onClose }: {
  pick: { src: string; amount: number; tone: 'in' | 'out' } | null
  startDate: string; endDate: string; branchId?: string | null
  onClose: () => void
}) {
  const { data, isLoading } = useQuery<{ data: { id: string; createdAt: string; amount: number; reason?: string | null; paymentMethod?: string | null; doc?: DocRef | null }[]; meta: { total: number } }>({
    queryKey: ['finance-trail', pick?.src, pick?.tone, startDate, endDate, branchId],
    queryFn: async () => {
      const p = new URLSearchParams({ startDate, endDate, sourceType: pick!.src, direction: pick!.tone === 'in' ? 'IN' : 'OUT', limit: '100' })
      if (branchId) p.set('branchId', branchId)
      return (await api.get(`/finance/transactions?${p}`)).data
    },
    enabled: !!pick,
  })
  if (!pick) return null
  const sign = pick.tone === 'in' ? 1 : -1
  const more = (data?.meta.total ?? 0) > (data?.data.length ?? 0)
  return (
    <DrillDrawer title={`${LEDGER_SOURCE[pick.src]?.icon ?? ''} ${ledgerLabel(pick.src)}`} onClose={onClose}>
      {isLoading ? <p className="text-sm text-muted-foreground">กำลังโหลด…</p> : (
        <TrailList trail={{
          title: '', expect: sign * pick.amount,
          note: more ? `แสดง ${data!.data.length} จาก ${data!.meta.total} รายการ — ดูทั้งหมดที่ “รายการทั้งหมด”` : undefined,
          rows: (data?.data ?? []).map((t) => ({
            time: t.createdAt, doc: t.doc ?? null, amount: sign * Number(t.amount),
            label: t.doc ? undefined : t.reason ?? undefined,
            sub: t.paymentMethod ? ({ CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' } as Record<string, string>)[t.paymentMethod] ?? t.paymentMethod : undefined,
          })),
        }} />
      )}
    </DrillDrawer>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const today   = new Date()
  const [startDate, setStartDate] = useState(toDate(startOfMonth(today)))
  const [endDate,   setEndDate]   = useState(toDate(endOfMonth(today)))

  const { branchId } = useBranchContext()
  const [pick, setPick] = useState<{ src: string; amount: number; tone: 'in' | 'out' } | null>(null)

  const { data, isLoading } = useQuery<FinanceSummary>({
    queryKey: ['finance-summary', startDate, endDate, branchId],
    queryFn: async () => {
      const p = new URLSearchParams({ startDate, endDate })
      if (branchId) p.set('branchId', branchId)
      return (await api.get(`/finance/summary?${p}`)).data
    },
    staleTime: 60_000,
  })

  function applyPreset(days: number) {
    if (days === 0) {
      setStartDate(toDate(today))
      setEndDate(toDate(today))
    } else {
      setStartDate(toDate(subDays(today, days - 1)))
      setEndDate(toDate(today))
    }
  }

  const entries = Object.entries(data?.bySource ?? {})
  const inRows  = entries.filter(([, v]) => v.in > 0).map(([src, v]) => ({ src, amount: v.in })).sort((a, b) => b.amount - a.amount)
  const kindOrder: Record<LedgerKind, number> = { cost: 0, refund: 1, owner: 2, income: 3 }
  const outRows = entries.filter(([, v]) => v.out > 0).map(([src, v]) => ({ src, amount: v.out }))
    .sort((a, b) => (kindOrder[LEDGER_SOURCE[a.src]?.kind ?? 'owner'] - kindOrder[LEDGER_SOURCE[b.src]?.kind ?? 'owner']) || b.amount - a.amount)
  const totalIn  = data?.totalIn ?? 0
  const totalOut = data?.totalOut ?? 0
  const net      = data?.net ?? 0
  const ownerOut = outRows.filter((r) => LEDGER_SOURCE[r.src]?.kind === 'owner').reduce((t, r) => t + r.amount, 0)
  const rangeLabel = startDate === endDate
    ? (startDate === toDate(today) ? 'วันนี้' : format(new Date(startDate + 'T12:00:00'), 'd MMM', { locale: th }))
    : `${format(new Date(startDate + 'T12:00:00'), 'd MMM', { locale: th })} – ${format(new Date(endDate + 'T12:00:00'), 'd MMM', { locale: th })}`

  return (
    <ModuleGate module="repair">
      <div className="space-y-5">
        <PageHeader
          title="การเงิน"
          icon={Wallet}
          subtitle="เงินเข้า-ออกร้าน: ได้มาจากไหน จ่ายไปไหน"
          secondaryActions={<BranchContextBar className="hidden sm:flex" />}
          primaryAction={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />พิมพ์
              </Button>
              <Link href="/finance/transactions">
                <Button variant="outline" size="sm" className="gap-1.5">
                  <Receipt className="h-4 w-4" />
                  รายการทั้งหมด
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          }
        />

        {/* Date range picker */}
        <div className="flex flex-wrap items-center gap-2">
          {PRESET_RANGES.map(({ label, days }) => (
            <Button key={days} variant="outline" size="sm" onClick={() => applyPreset(days)}>
              {label}
            </Button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <input
              type="date"
              className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
            />
            <span className="text-slate-400 text-sm">ถึง</span>
            <input
              type="date"
              className="h-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-3 text-sm"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-28 bg-slate-100 dark:bg-slate-700/60 rounded-2xl animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* Money in − money out = what is left, and a pointer to the real profit */}
            <div className="grid gap-4 rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-blue-50/60 p-5 shadow-sm dark:border-slate-700/60 dark:from-[#1E293B] dark:to-blue-950/30 md:grid-cols-[minmax(0,280px)_1fr]">
              <div>
                <p className="text-sm text-muted-foreground">{rangeLabel} เงินเข้า − เงินออก เหลือ</p>
                <p className={cn('text-5xl font-extrabold tabular-nums', net < 0 ? 'text-red-600' : 'text-blue-700 dark:text-blue-400')}>
                  {net < 0 ? '− ' : ''}{formatThaiMoney(Math.abs(net))}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{data?.txnCount ?? 0} รายการ · เงินสด โอน และบัตร</p>
              </div>
              <div className="flex flex-col justify-center gap-3">
                <MoneyEquation parts={[
                  { label: 'เงินเข้า', value: totalIn, tone: 'in' },
                  { label: 'เงินออก', value: totalOut, tone: 'out' },
                  { label: 'เหลือ', value: net, tone: 'result', result: true },
                ]} />
                <p className="text-xs leading-relaxed text-muted-foreground">
                  หน้านี้คือ <b>เงินที่เข้า-ออกจริง</b> — ไม่ใช่กำไร (ยังไม่หักทุนของ และเงินที่เจ้าของเอาออกก็นับเป็นเงินออก)
                  <Link href="/reports/profit" className="ml-1 inline-flex items-center font-semibold text-blue-600 hover:underline">
                    ดูกำไรจริง <ArrowRight className="ml-0.5 h-3 w-3" />
                  </Link>
                </p>
              </div>
            </div>

            {(inRows.length > 0 || outRows.length > 0) && (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SourceCard icon="💰" title="เงินเข้า" why="เงินที่ได้รับจากลูกค้า และเงินที่ใส่ลิ้นชัก">
                  <LedgerLines rows={inRows} total={totalIn} tone="in" onRow={(src, amount) => setPick({ src, amount, tone: 'in' })} />
                  <MoneyLine label="รวมเงินเข้า" value={totalIn} total />
                </SourceCard>
                <SourceCard icon="💸" title="เงินออก" why={ownerOut > 0 ? `ในนี้ ${formatThaiMoney(ownerOut)} เป็นเงินที่เจ้าของเอาออก/ย้ายเงิน — ไม่หักกำไร` : 'ค่าใช้จ่าย ค่ารถ จ่ายซัพพลายเออร์ และเงินที่คืนลูกค้า'}>
                  <LedgerLines rows={outRows} total={totalOut} tone="out" onRow={(src, amount) => setPick({ src, amount, tone: 'out' })} />
                  <MoneyLine label="รวมเงินออก" value={totalOut} total minus />
                </SourceCard>
              </div>
            )}

            {data?.txnCount === 0 && (
              <div className="flex flex-col items-center justify-center h-40 gap-2 bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700/60">
                <BarChart2 className="h-10 w-10 text-slate-200 dark:text-slate-600" />
                <p className="text-sm text-muted-foreground">ไม่มีรายการในช่วงนี้</p>
              </div>
            )}
          </>
        )}
      </div>
      <LedgerTrail pick={pick} startDate={startDate} endDate={endDate} branchId={branchId} onClose={() => setPick(null)} />
    </ModuleGate>
  )
}
