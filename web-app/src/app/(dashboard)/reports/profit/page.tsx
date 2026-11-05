'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, TrendingUp,
  Download, Printer, AlertTriangle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import { DrillDrawer } from '@/components/reports/drill-drawer'
import { PageHeader } from '@/components/ui/page-header'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import api from '@/lib/api'
import type {
  ProfitReport,
  ProfitReportPosItem,
  ProfitReportRepairItem,
  ProfitReportPackageItem,
  ProfitReportExpenseItem,
} from '@/types'
import { SendPdfButton } from '@/components/reports/send-pdf-button'
import { MoneyEquation, MoneyLine, SourceCard, SplitBar } from '@/components/reports/money-parts'
import Link from 'next/link'

// ── helpers ───────────────────────────────────────────────────────────────────

const PM_LABEL: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' }

function fmtTime(iso: string) {
  return format(new Date(iso), 'HH:mm', { locale: th })
}

function profitColor(v: number) {
  return v >= 0 ? 'text-green-600' : 'text-red-600'
}

// ── CSV helpers ───────────────────────────────────────────────────────────────

function downloadCSV(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function posCSV(items: ProfitReportPosItem[], period: string) {
  downloadCSV(
    [
      ['POS Profit Detail', period],
      ['เวลา', 'ใบเสร็จ', 'ลูกค้า', 'สินค้า', 'จำนวน', 'รายได้', 'COGS', 'กำไร'],
      ...items.map((i) => [
        fmtTime(i.time), i.receiptNumber, i.customer ?? '-', i.product,
        String(i.qty), String(i.revenue), String(i.cogs), String(i.profit),
      ]),
    ],
    `pos-profit-${period}.csv`,
  )
}

function repairCSV(items: ProfitReportRepairItem[], period: string) {
  downloadCSV(
    [
      ['Repair Profit Detail', period],
      ['เวลา', 'เลขงาน', 'ลูกค้า', 'อุปกรณ์', 'รายได้', 'ค่าอะไหล่', 'ค่าแรง', 'กำไร'],
      ...items.map((i) => [
        fmtTime(i.time), i.ticketNumber, i.customer ?? '-', i.device,
        String(i.revenue), String(i.partsCost), String(i.laborCost), String(i.profit),
      ]),
    ],
    `repair-profit-${period}.csv`,
  )
}

function packageCSV(items: ProfitReportPackageItem[], period: string) {
  downloadCSV(
    [
      ['Package Profit Detail', period],
      ['เวลา', 'ใบเสร็จ', 'ค่าย', 'ยอด', 'กำไร'],
      ...items.map((i) => [
        fmtTime(i.time), i.receiptNumber, i.carrier, String(i.amount), String(i.profit),
      ]),
    ],
    `package-profit-${period}.csv`,
  )
}

function expenseCSV(items: ProfitReportExpenseItem[], period: string) {
  downloadCSV(
    [
      ['Expense Detail', period],
      ['เวลา', 'รายการ', 'หมวดหมู่', 'ช่องทาง', 'ยอด'],
      ...items.map((i) => [
        fmtTime(i.time), i.description, i.category,
        PM_LABEL[i.paymentMethod] ?? i.paymentMethod, String(i.amount),
      ]),
    ],
    `expenses-${period}.csv`,
  )
}

// ── Drawer content components ─────────────────────────────────────────────────

function DrawerTable({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="overflow-x-auto -mx-5 px-5">
      <table className="w-full text-xs min-w-[540px]">
        <thead>
          <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400">
            {head.map((h) => (
              <th key={h} className="px-2 py-2 text-left font-medium whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-slate-50/60">
              {row.map((cell, j) => (
                <td key={j} className="px-2 py-2 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={head.length} className="text-center py-8 text-slate-400">ไม่มีรายการ</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

type DrawerKey = 'pos' | 'repair' | 'package' | 'expense' | 'net' | null

/** Marks a hidden cost (ต้นทุนแฝง) */
function HiddenTag() {
  return <span className="ml-1 rounded bg-fuchsia-100 px-1.5 py-0.5 text-[10px] font-bold text-fuchsia-700 dark:bg-fuchsia-900/40 dark:text-fuchsia-300">แฝง</span>
}

/** The report in plain Thai: one sentence for the profit, then where each part comes from */
function ProfitSummary({ data, periodLabel, onDetail }: { data: ProfitReport; periodLabel: string; onDetail: (k: DrawerKey) => void }) {
  const posFreebie = data.pos.freebieCost ?? 0
  const repFreebie = data.repair.freebieCost ?? 0
  const delivery = data.repair.deliveryCost ?? 0
  const cost = data.pos.cogs + data.repair.partsCost + repFreebie + delivery + data.repair.laborCost
  const hidden = data.hiddenCosts
  const income = data.summary.totalRevenue
  const net = data.summary.netProfit
  const per100 = income > 0 ? Math.round((net / income) * 100) : 0
  const refunds = data.pos.refunds ?? 0
  const sold = data.pos.grossSales ?? data.pos.revenue + refunds
  const w = data.costWarnings
  const hasWarnings = !!w && (w.belowCostCount > 0 || w.noCostCount > 0)
  const other = data.otherIncome?.revenue ?? 0
  return (
    <div className="space-y-4">
      {/* The answer first */}
      <div className="grid gap-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,320px)_1fr] dark:border-slate-700/60 dark:bg-[#1E293B]">
        <div>
          <p className="text-sm text-muted-foreground">{periodLabel} ร้าน{net >= 0 ? 'ได้กำไรจริง' : 'ขาดทุน'}</p>
          <p className={`text-5xl font-extrabold tabular-nums ${net >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}`}>{formatThaiMoney(Math.abs(net))}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            หักทุนของและค่าใช้จ่ายแล้ว{income > 0 && net > 0 ? ` · ทุก ฿100 ที่รับมา เหลือเป็นกำไร ฿${per100}` : ''}
          </p>
          <button type="button" onClick={() => onDetail('net')} className="mt-2 inline-flex items-center text-sm font-semibold text-blue-600 hover:underline print:hidden">
            ดูที่มาทีละรายการ<ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <MoneyEquation parts={[
            { label: 'รับเงินมา', value: income, tone: 'in' },
            { label: 'ทุนของ/อะไหล่', value: cost, tone: 'out' },
            { label: 'ค่าใช้จ่าย', value: data.expenses.total, tone: 'out' },
            { label: net >= 0 ? 'เหลือ' : 'ขาดทุน', value: net, tone: 'result', result: true },
          ]} />
          <SplitBar parts={[
            { value: Math.max(0, net), className: 'bg-emerald-500', label: 'กำไร' },
            { value: cost, className: 'bg-red-300', label: 'ทุนของ/อะไหล่' },
            { value: data.expenses.total, className: 'bg-orange-300', label: 'ค่าใช้จ่าย' },
          ]} />
          <p className="text-xs text-muted-foreground">
            “รับเงินมา” = ขายของ (หักเงินคืนแล้ว) + ค่าซ่อมที่ได้รับจริง + ค่าคอมซิม{other > 0 ? ' + รายรับไม่มีบิล' : ''}
          </p>
        </div>
      </div>

      {/* Profit by source, added up */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B]">
        <span className="text-sm font-semibold">กำไรมาจากไหน:</span>
        <MoneyEquation parts={[
          { label: '🛒 ขายของ', value: data.pos.profit, tone: 'in' },
          { label: '🔧 งานซ่อม', value: data.repair.profit, tone: 'in' },
          { label: '📶 ค่าคอมซิม', value: data.package.profit, tone: 'in' },
          ...(other > 0 ? [{ label: 'รับเงินไม่มีบิล', value: other, tone: 'in' as const }] : []),
          { label: '🏠 ค่าใช้จ่ายร้าน', value: data.expenses.total, tone: 'out' },
          { label: net >= 0 ? 'กำไร' : 'ขาดทุน', value: net, tone: 'result', result: true },
        ]} />
      </div>

      {/* Where it came from */}
      <div className="grid gap-4 md:grid-cols-3">
        <SourceCard icon="🛒" title="ขายของหน้าร้าน" onDetail={() => onDetail('pos')} detailLabel="ดูทีละบิล"
          why="ราคาที่ขายจริงหลังส่วนลด · ของที่ลูกค้าคืน ทุนของชิ้นนั้นก็กลับเข้าร้าน">
          <MoneyLine label={`ขายได้${data.pos.billCount != null ? ` (${data.pos.billCount} บิล)` : ''}`} value={sold} />
          {refunds > 0 && <MoneyLine label={`คืนเงินลูกค้า${data.pos.refundCount ? ` (${data.pos.refundCount} ครั้ง)` : ''}`} value={refunds} minus />}
          <MoneyLine label="ทุนของที่ขายไป" value={data.pos.cogs - posFreebie} minus />
          {posFreebie > 0 && <MoneyLine label={<>ทุนของแถม <HiddenTag /></>} value={posFreebie} minus />}
          <MoneyLine label="กำไร" value={data.pos.profit} total />
        </SourceCard>
        <SourceCard icon="🔧" title="งานซ่อม" onDetail={() => onDetail('repair')} detailLabel="ดูทีละงาน"
          why="นับเงินในวันที่ได้รับจริง — มัดจำนับวันรับเครื่อง ส่วนที่ยังค้างชำระยังไม่นับ">
          <MoneyLine label={`รับเงินค่าซ่อม${data.repair.count ? ` (${data.repair.count} งาน)` : ''}`} value={data.repair.revenue} />
          {(data.repair.deposits ?? 0) > 0 && <MoneyLine label="มัดจำตอนรับเครื่อง" value={data.repair.deposits!} muted />}
          {(data.repair.atPickup ?? 0) > 0 && <MoneyLine label="จ่ายตอนรับเครื่องคืน" value={data.repair.atPickup!} muted />}
          {(data.repair.debtPayments ?? 0) > 0 && <MoneyLine label="จ่ายหนี้ค้าง" value={data.repair.debtPayments!} muted />}
          <MoneyLine label="ค่าอะไหล่ที่ใช้" value={data.repair.partsCost} minus />
          {repFreebie > 0 && <MoneyLine label={<>อะไหล่แถม <HiddenTag /></>} value={repFreebie} minus />}
          {delivery > 0 && <MoneyLine label={<>ค่ารถส่งอะไหล่ ({data.repair.deliveryCount ?? 0} รอบ) <HiddenTag /></>} value={delivery} minus />}
          {data.repair.laborCost > 0 && <MoneyLine label="ค่าแรงช่าง" value={data.repair.laborCost} minus />}
          <MoneyLine label="กำไร" value={data.repair.profit} total />
        </SourceCard>
        <SourceCard icon="📶" title="ซิม / เติมเงิน" onDetail={data.package.count > 0 ? () => onDetail('package') : undefined}
          why="เงินซิมส่วนใหญ่เป็นของค่าย ร้านได้แค่ค่าคอม จึงนับเป็นกำไรเฉพาะค่าคอม">
          <MoneyLine label={`ขายแพ็กเกจ${data.package.count ? ` (${data.package.count} รายการ)` : ''}`} value={data.package.revenue} />
          <MoneyLine label="จ่ายค่าย" value={data.package.revenue - data.package.profit} minus />
          <MoneyLine label="ค่าคอมที่ได้" value={data.package.profit} total />
        </SourceCard>
      </div>

      <div className={`grid gap-4 ${hasWarnings || (hidden && hidden.total > 0) ? 'md:grid-cols-2' : ''}`}>
        <SourceCard icon="🧾" title="ค่าใช้จ่าย" onDetail={data.expenses.items.length ? () => onDetail('expense') : undefined}
          why="รายจ่ายที่ไม่ได้เป็นของงานหรือบิลไหน เช่น ค่าเช่า ค่าไฟ เงินเดือน ค่ารถที่ไม่ได้ระบุงาน">
          {data.expenses.breakdown.length === 0
            ? <p className="py-1 text-sm text-muted-foreground">ไม่มีค่าใช้จ่ายในช่วงนี้</p>
            : data.expenses.breakdown.map((e) => <MoneyLine key={e.code} label={<>{e.name}{e.code === 'parts_delivery' && <> <HiddenTag /></>}</>} value={e.total} minus />)}
          {other > 0 && <MoneyLine label={`รายรับไม่มีบิล (${data.otherIncome!.count} รายการ)`} value={other} note="เงินรับเข้าลิ้นชักที่ไม่ได้ออกบิล — นับเป็นกำไรทั้งหมด" />}
          {data.expenses.breakdown.length > 1 && <MoneyLine label="รวมค่าใช้จ่าย" value={-data.expenses.total} total />}
        </SourceCard>
        {hidden && hidden.total > 0 && (
          <div className="rounded-2xl border-2 border-fuchsia-200 bg-fuchsia-50/70 p-4 dark:border-fuchsia-900 dark:bg-fuchsia-900/10">
            <h3 className="font-bold">🔍 ต้นทุนแฝงช่วงนี้ <span className="text-xs font-normal text-muted-foreground">(หักไว้ในกล่องข้างบนแล้ว — ตรงนี้รวมให้ดู ไม่หักซ้ำ)</span></h3>
            {hidden.freebies.total > 0 && (
              <MoneyLine label={`🎁 ของแถม${hidden.freebies.sales > 0 && hidden.freebies.repairs > 0 ? ` (ขาย ${formatThaiMoney(hidden.freebies.sales)} + ซ่อม ${formatThaiMoney(hidden.freebies.repairs)})` : ''}`}
                value={hidden.freebies.total}
                note={hidden.freebies.items.slice(0, 4).map((x) => `${x.name} ${x.qty}`).join(' · ')} />
            )}
            {hidden.delivery.total > 0 && (
              <MoneyLine label={`🚐 ค่ารถส่งอะไหล่ (${hidden.delivery.count} รอบ)`} value={hidden.delivery.total}
                note={`ระบุงาน ${formatThaiMoney(hidden.delivery.jobs)} · ค่าใช้จ่ายร้าน ${formatThaiMoney(hidden.delivery.shop)}`} />
            )}
            <div className="mt-1.5 flex items-baseline justify-between border-t border-fuchsia-200 pt-2.5 text-base font-bold dark:border-fuchsia-900">
              <span>รวมต้นทุนแฝง</span><span className="tabular-nums text-fuchsia-700 dark:text-fuchsia-300">{formatThaiMoney(hidden.total)}</span>
            </div>
            {net > 0 && <p className="mt-2 text-xs text-muted-foreground">= {Math.round((hidden.total / net) * 100)}% ของกำไร — ถ้าเยอะ ลองรวมรอบสั่งของ หรือบวกค่าส่งเข้าราคาซ่อม</p>}
          </div>
        )}
        {hasWarnings && (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-900/20">
            <h3 className="flex items-center gap-2 font-bold text-amber-900 dark:text-amber-200"><AlertTriangle className="h-4 w-4" /> ตัวเลขที่อาจทำให้กำไรผิด — ตรวจก่อน</h3>
            <div className="mt-2 divide-y divide-amber-200 text-sm dark:divide-amber-800">
              {w!.belowCost.map((x) => (
                <div key={x.productId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">{x.name} · ทุน <b className="text-red-700">{formatThaiMoney(x.cost)}</b> แต่ขาย {formatThaiMoney(x.soldAt)}
                    <span className="block text-xs text-amber-800/80">ขายต่ำกว่าทุน — ถ้าทุนพิมพ์ผิด กำไรจะติดลบเกินจริง</span></span>
                  <Link href={`/products?q=${encodeURIComponent(x.name)}`} className="shrink-0 rounded-lg border border-amber-400 bg-white px-2.5 py-1 text-xs font-bold text-amber-900 print:hidden">แก้ทุน</Link>
                </div>
              ))}
              {w!.noCostCount > 0 && (
                <div className="py-2">
                  สินค้าที่ไม่มีต้นทุน {w!.noCostCount} รายการ — กำไรของชิ้นเหล่านี้จะดูสูงเกินจริง
                  <span className="block text-xs text-amber-800/80">{w!.noCost.map((x) => x.name).join(', ')}{w!.noCostCount > w!.noCost.length ? ' …' : ''}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function ProfitReportPage() {
  const hasModule = useAuthStore((s) => s.hasModule)
  const [refMonth, setRefMonth]     = useState(() => new Date())
  const [mode, setMode]             = useState<'today' | 'week' | 'month' | 'custom'>('month')
  const [customStart, setCustomStart] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [drawer, setDrawer]         = useState<DrawerKey>(null)

  const { startDate, endDate } = useMemo(() => {
    if (mode === 'custom') return { startDate: customStart, endDate: customEnd }
    const todayStr = format(new Date(), 'yyyy-MM-dd')
    if (mode === 'today') return { startDate: todayStr, endDate: todayStr }
    if (mode === 'week') return { startDate: format(new Date(Date.now() - 6 * 86_400_000), 'yyyy-MM-dd'), endDate: todayStr }
    const s = startOfMonth(refMonth)
    const e = endOfMonth(refMonth)
    return { startDate: format(s, 'yyyy-MM-dd'), endDate: format(e, 'yyyy-MM-dd') }
  }, [mode, refMonth, customStart, customEnd])

  const period = `${startDate}—${endDate}`
  const fmtDay = (d: string) => format(new Date(`${d}T00:00:00`), 'd MMM yy', { locale: th })
  const periodLabel = mode === 'today' ? 'วันนี้'
    : mode === 'week' ? '7 วันล่าสุด'
    : mode === 'month' ? `เดือน${format(refMonth, 'MMMM yyyy', { locale: th })}`
    : startDate === endDate ? fmtDay(startDate) : `${fmtDay(startDate)} – ${fmtDay(endDate)}`

  const { data, isLoading, isError } = useQuery<ProfitReport>({
    queryKey: ['profit-report', startDate, endDate],
    queryFn: async () => (await api.get('/reports/profit', { params: { startDate, endDate } })).data,
    staleTime: 2 * 60 * 1000,
  })

  const openDrawer = useCallback((key: DrawerKey) => setDrawer(key), [])

  // ── Drawer content ──────────────────────────────────────────────────────────

  const posDrawerContent = useMemo(() => {
    const items = data?.pos.items ?? []
    return (
      <DrawerTable
        head={['เวลา', 'ใบเสร็จ', 'ลูกค้า', 'สินค้า', 'จำนวน', 'ขายได้', 'ทุน', 'กำไร']}
        rows={items.map((i) => [
          fmtTime(i.time),
          <span key="r" className="font-mono text-blue-700 font-bold">{i.receiptNumber}</span>,
          i.customer ?? 'ทั่วไป',
          i.isFreebie ? <span key="f">{i.product} <span className="rounded bg-fuchsia-100 px-1 text-[10px] font-bold text-fuchsia-700">แถม</span></span> : i.product,
          String(i.qty),
          formatThaiMoney(i.revenue),
          <span key="c" className="text-red-600">{formatThaiMoney(i.cogs)}</span>,
          <span key="p" className={profitColor(i.profit)}>{formatThaiMoney(i.profit)}</span>,
        ])}
      />
    )
  }, [data])

  const repairDrawerContent = useMemo(() => {
    const items = data?.repair.items ?? []
    return (
      <DrawerTable
        head={['เวลา', 'เลขงาน', 'ลูกค้า', 'อุปกรณ์', 'รับเงิน', 'อะไหล่', 'ค่ารถ', 'ค่าแรง', 'กำไร']}
        rows={items.map((i) => [
          fmtTime(i.time),
          <span key="t" className="font-mono text-blue-700 font-bold">{i.ticketNumber}</span>,
          i.customer ?? '-',
          i.device,
          formatThaiMoney(i.revenue),
          <span key="p" className="text-red-600">{formatThaiMoney(i.partsCost)}</span>,
          <span key="d" className="text-red-600">{i.deliveryCost ? formatThaiMoney(i.deliveryCost) : '—'}</span>,
          <span key="l" className="text-red-600">{formatThaiMoney(i.laborCost)}</span>,
          <span key="g" className={profitColor(i.profit)}>{formatThaiMoney(i.profit)}</span>,
        ])}
      />
    )
  }, [data])

  const packageDrawerContent = useMemo(() => {
    const items = data?.package.items ?? []
    return (
      <DrawerTable
        head={['เวลา', 'ใบเสร็จ', 'ค่าย', 'ยอด', 'กำไร']}
        rows={items.map((i) => [
          fmtTime(i.time),
          <span key="r" className="font-mono text-blue-700 font-bold">{i.receiptNumber}</span>,
          i.carrier,
          formatThaiMoney(i.amount),
          <span key="p" className={profitColor(i.profit)}>{formatThaiMoney(i.profit)}</span>,
        ])}
      />
    )
  }, [data])

  const expenseDrawerContent = useMemo(() => {
    const items = data?.expenses.items ?? []
    return (
      <DrawerTable
        head={['เวลา', 'รายการ', 'หมวดหมู่', 'ช่องทาง', 'ยอด']}
        rows={items.map((i) => [
          fmtTime(i.time),
          i.description,
          i.category,
          PM_LABEL[i.paymentMethod] ?? i.paymentMethod,
          <span key="a" className="font-semibold text-red-600">{formatThaiMoney(i.amount)}</span>,
        ])}
      />
    )
  }, [data])

  const netDrawerContent = useMemo(() => {
    if (!data) return null
    const allRows: { time: string; type: string; label: string; revenue: number; cost: number; profit: number }[] = [
      ...data.pos.items.map((i) => ({
        time: i.time, type: 'ขายของ', label: `${i.receiptNumber} · ${i.product}`,
        revenue: i.revenue, cost: i.cogs, profit: i.profit,
      })),
      ...data.repair.items.map((i) => ({
        time: i.time, type: 'ซ่อม', label: `${i.ticketNumber} · ${i.device}`,
        revenue: i.revenue, cost: i.partsCost + (i.deliveryCost ?? 0) + i.laborCost, profit: i.profit,
      })),
      ...data.package.items.map((i) => ({
        time: i.time, type: 'ซิม', label: `${i.receiptNumber} · ${i.carrier}`,
        revenue: i.amount, cost: i.amount - i.profit, profit: i.profit,
      })),
    ].sort((a, b) => a.time.localeCompare(b.time))

    return (
      <div className="space-y-4">
        <DrawerTable
          head={['เวลา', 'ประเภท', 'รายการ', 'รายได้', 'ต้นทุน', 'กำไร']}
          rows={allRows.map((r) => [
            fmtTime(r.time),
            <span key="t" className="text-xs bg-slate-100 px-1.5 py-0.5 rounded font-medium">{r.type}</span>,
            r.label,
            formatThaiMoney(r.revenue),
            <span key="c" className="text-red-600">{formatThaiMoney(r.cost)}</span>,
            <span key="p" className={profitColor(r.profit)}>{formatThaiMoney(r.profit)}</span>,
          ])}
        />
        {/* Summary */}
        <div className="border-t pt-4 space-y-2 text-sm">
          {[
            { label: 'กำไรก่อนหักค่าใช้จ่าย (ขายของ + ซ่อม + ซิม)', value: data.summary.grossProfit, bold: false },
            { label: `ค่าใช้จ่าย (${data.expenses.items.length} รายการ)`, value: -data.expenses.total, bold: false },
            { label: 'กำไรจริง', value: data.summary.netProfit, bold: true },
          ].map(({ label, value, bold }) => (
            <div key={label} className={`flex justify-between ${bold ? 'font-bold text-base border-t pt-2' : ''}`}>
              <span className={bold ? '' : 'text-slate-600'}>{label}</span>
              <span className={profitColor(value)}>{formatThaiMoney(value)}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }, [data])

  // ── Drawer config ───────────────────────────────────────────────────────────

  const drawerConfig: Record<NonNullable<DrawerKey>, {
    title: string
    content: React.ReactNode
    csvFn?: () => void
  }> = useMemo(() => ({
    pos: {
      title: `ขายของหน้าร้าน — ทีละรายการ (${data?.pos.items.length ?? 0} รายการ)`,
      content: posDrawerContent,
      csvFn: data ? () => posCSV(data.pos.items, period) : undefined,
    },
    repair: {
      title: `งานซ่อม — ทีละงาน (${data?.repair.count ?? 0} งาน)`,
      content: repairDrawerContent,
      csvFn: data ? () => repairCSV(data.repair.items, period) : undefined,
    },
    package: {
      title: `ซิม / เติมเงิน — ทีละรายการ (${data?.package.count ?? 0} รายการ)`,
      content: packageDrawerContent,
      csvFn: data ? () => packageCSV(data.package.items, period) : undefined,
    },
    expense: {
      title: `ค่าใช้จ่าย — ทีละรายการ (${data?.expenses.items.length ?? 0} รายการ)`,
      content: expenseDrawerContent,
      csvFn: data ? () => expenseCSV(data.expenses.items, period) : undefined,
    },
    net: {
      title: 'ที่มาของกำไรทั้งหมด',
      content: netDrawerContent,
    },
  }), [data, posDrawerContent, repairDrawerContent, packageDrawerContent, expenseDrawerContent, netDrawerContent, period])

  const activeDrawer = drawer ? drawerConfig[drawer] : null

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!hasModule('report')) return <ModuleGate module="report">{null}</ModuleGate>

  return (
    <>
      <div id="profit-report" className="space-y-6 print:space-y-4">

        {/* Header */}
        <PageHeader
          title="กำไรของร้าน"
          icon={TrendingUp}
          subtitle="เงินที่รับมา หักทุนของและค่าใช้จ่าย เหลือเป็นกำไรเท่าไร"
          primaryAction={
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              <div className="flex rounded-lg border overflow-hidden text-sm">
                {([['today', 'วันนี้'], ['week', '7 วัน'], ['month', 'รายเดือน'], ['custom', 'เลือกวัน']] as const).map(([m, label]) => (
                  <button key={m} onClick={() => setMode(m)}
                    className={`px-3 py-1.5 ${mode === m ? 'bg-blue-600 text-white' : 'bg-white dark:bg-[#1E293B] text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/40'}`}>
                    {label}
                  </button>
                ))}
              </div>
              {mode === 'month' ? (
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" onClick={() => setRefMonth((d) => subMonths(d, 1))}>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium w-28 text-center">
                    {format(refMonth, 'MMMM yyyy', { locale: th })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setRefMonth((d) => addMonths(d, 1))}>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              ) : mode !== 'custom' ? null : (
                <div className="flex items-center gap-2 text-sm">
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <span className="text-slate-400">—</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              )}
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.print()}>
                <Printer className="h-3.5 w-3.5" />พิมพ์
              </Button>
              <SendPdfButton target={() => document.getElementById('profit-report')}
                filename={`รายงานกำไร-${mode === 'month' ? format(refMonth, 'yyyy-MM') : `${startDate}_${endDate}`}.pdf`} />
            </div>
          }
        />

        {isLoading && <div className="flex items-center justify-center py-20 text-slate-400">กำลังโหลด...</div>}
        {isError  && <div className="flex items-center justify-center py-20 text-red-500">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</div>}

        {data && <ProfitSummary data={data} periodLabel={periodLabel} onDetail={openDrawer} />}
      </div>

      {/* Detail drawer */}
      {activeDrawer && (
        <DrillDrawer
          title={activeDrawer.title}
          onClose={() => setDrawer(null)}
          wide
          action={
            activeDrawer.csvFn ? (
              <button
                onClick={activeDrawer.csvFn}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border rounded-lg px-2.5 py-1.5 hover:bg-slate-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            ) : undefined
          }
        >
          {activeDrawer.content}
        </DrillDrawer>
      )}

      <style>{`
        @media print {
          .print\\:space-y-4 > * + * { margin-top: 1rem; }
          button { pointer-events: none; }
        }
      `}</style>
    </>
  )
}
