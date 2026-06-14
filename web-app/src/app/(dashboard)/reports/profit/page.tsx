'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, TrendingUp, TrendingDown,
  ShoppingCart, Wrench, Package, Receipt, Download,
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
          <tr className="border-b bg-gray-50 text-gray-500">
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

// ── Clickable StatCard ────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon: Icon, color, onClick,
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType; color: string; onClick?: () => void
}) {
  const inner = (
    <div className="rounded-xl border bg-white p-4 flex items-start gap-3 shadow-sm h-full">
      <div className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${color}`}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500 truncate">{label}</p>
        <p className="mt-0.5 text-lg font-bold text-slate-900 leading-tight">{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
      {onClick && (
        <ChevronRight className="h-4 w-4 text-slate-300 shrink-0 mt-3 group-hover:text-blue-400 transition-colors" />
      )}
    </div>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="group text-left w-full hover:shadow-md transition-shadow rounded-xl">
        {inner}
      </button>
    )
  }
  return inner
}

// ── Clickable ProfitBar ───────────────────────────────────────────────────────

function ProfitBar({
  label, profit, revenue, color, onClick,
}: {
  label: string; profit: number; revenue: number; color: string; onClick?: () => void
}) {
  const margin = revenue > 0 ? (profit / revenue) * 100 : 0
  const content = (
    <>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-700">{label}</span>
        <span className={`font-semibold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatThaiMoney(profit)}
          {onClick && <ChevronRight className="inline h-3.5 w-3.5 ml-1 text-slate-400" />}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(Math.abs(margin), 100)}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-slate-400 mt-0.5">
        <span>รายได้ {formatThaiMoney(revenue)}</span>
        <span>margin {margin.toFixed(1)}%</span>
      </div>
    </>
  )
  if (onClick) {
    return (
      <button onClick={onClick} className="w-full text-left hover:bg-slate-50 rounded-lg p-1 -m-1 transition-colors">
        {content}
      </button>
    )
  }
  return <div>{content}</div>
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type DrawerKey = 'pos' | 'repair' | 'package' | 'expense' | 'net' | null

export default function ProfitReportPage() {
  const hasModule = useAuthStore((s) => s.hasModule)
  const [refMonth, setRefMonth]     = useState(() => new Date())
  const [mode, setMode]             = useState<'month' | 'custom'>('month')
  const [customStart, setCustomStart] = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [customEnd, setCustomEnd]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [drawer, setDrawer]         = useState<DrawerKey>(null)

  const { startDate, endDate } = useMemo(() => {
    if (mode === 'custom') return { startDate: customStart, endDate: customEnd }
    const s = startOfMonth(refMonth)
    const e = endOfMonth(refMonth)
    return { startDate: format(s, 'yyyy-MM-dd'), endDate: format(e, 'yyyy-MM-dd') }
  }, [mode, refMonth, customStart, customEnd])

  const period = `${startDate}—${endDate}`

  const { data, isLoading, isError } = useQuery<ProfitReport>({
    queryKey: ['profit-report', startDate, endDate],
    queryFn: async () => (await api.get('/reports/profit', { params: { startDate, endDate } })).data,
    staleTime: 2 * 60 * 1000,
  })

  const openDrawer = useCallback((key: DrawerKey) => setDrawer(key), [])

  const netPositive = (data?.summary.netProfit ?? 0) >= 0

  // ── Drawer content ──────────────────────────────────────────────────────────

  const posDrawerContent = useMemo(() => {
    const items = data?.pos.items ?? []
    return (
      <DrawerTable
        head={['เวลา', 'ใบเสร็จ', 'ลูกค้า', 'สินค้า', 'จำนวน', 'รายได้', 'COGS', 'กำไร']}
        rows={items.map((i) => [
          fmtTime(i.time),
          <span key="r" className="font-mono text-blue-700 font-bold">{i.receiptNumber}</span>,
          i.customer ?? 'ทั่วไป',
          i.product,
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
        head={['เวลา', 'เลขงาน', 'ลูกค้า', 'อุปกรณ์', 'รายได้', 'อะไหล่', 'แรงงาน', 'กำไร']}
        rows={items.map((i) => [
          fmtTime(i.time),
          <span key="t" className="font-mono text-blue-700 font-bold">{i.ticketNumber}</span>,
          i.customer ?? '-',
          i.device,
          formatThaiMoney(i.revenue),
          <span key="p" className="text-red-600">{formatThaiMoney(i.partsCost)}</span>,
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
        time: i.time, type: 'POS', label: `${i.receiptNumber} · ${i.product}`,
        revenue: i.revenue, cost: i.cogs, profit: i.profit,
      })),
      ...data.repair.items.map((i) => ({
        time: i.time, type: 'ซ่อม', label: `${i.ticketNumber} · ${i.device}`,
        revenue: i.revenue, cost: i.partsCost + i.laborCost, profit: i.profit,
      })),
      ...data.package.items.map((i) => ({
        time: i.time, type: 'Package', label: `${i.receiptNumber} · ${i.carrier}`,
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
            { label: 'Gross Profit (POS + ซ่อม + Package)', value: data.summary.grossProfit, bold: false },
            { label: `ค่าใช้จ่าย (${data.expenses.items.length} รายการ)`, value: -data.expenses.total, bold: false },
            { label: 'Net Profit', value: data.summary.netProfit, bold: true },
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
      title: `POS Profit Detail (${data?.pos.items.length ?? 0} รายการ)`,
      content: posDrawerContent,
      csvFn: data ? () => posCSV(data.pos.items, period) : undefined,
    },
    repair: {
      title: `Repair Profit Detail (${data?.repair.count ?? 0} งาน)`,
      content: repairDrawerContent,
      csvFn: data ? () => repairCSV(data.repair.items, period) : undefined,
    },
    package: {
      title: `Package Profit Detail (${data?.package.count ?? 0} รายการ)`,
      content: packageDrawerContent,
      csvFn: data ? () => packageCSV(data.package.items, period) : undefined,
    },
    expense: {
      title: `Expense Detail (${data?.expenses.items.length ?? 0} รายการ)`,
      content: expenseDrawerContent,
      csvFn: data ? () => expenseCSV(data.expenses.items, period) : undefined,
    },
    net: {
      title: 'Net Profit Breakdown',
      content: netDrawerContent,
    },
  }), [data, posDrawerContent, repairDrawerContent, packageDrawerContent, expenseDrawerContent, netDrawerContent, period])

  const activeDrawer = drawer ? drawerConfig[drawer] : null

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!hasModule('report')) return <ModuleGate module="report">{null}</ModuleGate>

  return (
    <>
      <div className="space-y-6 print:space-y-4">

        {/* Header */}
        <PageHeader
          title="รายงานกำไร"
          icon={TrendingUp}
          subtitle="คลิกที่การ์ดเพื่อดูรายละเอียด · Net Profit = Gross − ค่าใช้จ่าย"
          primaryAction={
            <div className="flex items-center gap-2 flex-wrap print:hidden">
              <div className="flex rounded-lg border overflow-hidden text-sm">
                <button
                  onClick={() => setMode('month')}
                  className={`px-3 py-1.5 ${mode === 'month' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  รายเดือน
                </button>
                <button
                  onClick={() => setMode('custom')}
                  className={`px-3 py-1.5 ${mode === 'custom' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                >
                  กำหนดเอง
                </button>
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
              ) : (
                <div className="flex items-center gap-2 text-sm">
                  <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                  <span className="text-slate-400">—</span>
                  <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="rounded-lg border px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
              )}
            </div>
          }
        />

        {isLoading && <div className="flex items-center justify-center py-20 text-slate-400">กำลังโหลด...</div>}
        {isError  && <div className="flex items-center justify-center py-20 text-red-500">เกิดข้อผิดพลาด ลองใหม่อีกครั้ง</div>}

        {data && (
          <>
            {/* Summary KPI cards — all clickable */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard
                label="รายได้รวม"
                value={formatThaiMoney(data.summary.totalRevenue)}
                sub={`${startDate} — ${endDate}`}
                icon={TrendingUp}
                color="bg-blue-500"
                onClick={() => openDrawer('net')}
              />
              <StatCard
                label="Gross Profit"
                value={formatThaiMoney(data.summary.grossProfit)}
                sub={`margin ${data.summary.grossMargin.toFixed(1)}%`}
                icon={data.summary.grossProfit >= 0 ? TrendingUp : TrendingDown}
                color={data.summary.grossProfit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}
                onClick={() => openDrawer('net')}
              />
              <StatCard
                label="ค่าใช้จ่ายรวม"
                value={formatThaiMoney(data.expenses.total)}
                sub={`${data.expenses.items.length} รายการ`}
                icon={Receipt}
                color="bg-orange-500"
                onClick={() => openDrawer('expense')}
              />
              <StatCard
                label="Net Profit"
                value={formatThaiMoney(data.summary.netProfit)}
                sub={`margin ${data.summary.netMargin.toFixed(1)}%`}
                icon={netPositive ? TrendingUp : TrendingDown}
                color={netPositive ? 'bg-violet-600' : 'bg-red-600'}
                onClick={() => openDrawer('net')}
              />
            </div>

            {/* Profit breakdown by segment — clickable bars */}
            <div className="rounded-xl border bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-800 mb-4">กำไรแยกตามหมวด</h2>
              <div className="space-y-5">
                <ProfitBar
                  label="POS (ขายสินค้า)"
                  profit={data.pos.profit}
                  revenue={data.pos.revenue}
                  color="bg-blue-500"
                  onClick={() => openDrawer('pos')}
                />
                <ProfitBar
                  label="งานซ่อม"
                  profit={data.repair.profit}
                  revenue={data.repair.revenue}
                  color="bg-purple-500"
                  onClick={() => openDrawer('repair')}
                />
                <ProfitBar
                  label="Package"
                  profit={data.package.profit}
                  revenue={data.package.revenue}
                  color="bg-teal-500"
                  onClick={() => openDrawer('package')}
                />
              </div>
            </div>

            {/* Detail segment cards — all clickable */}
            <div className="grid gap-4 sm:grid-cols-2">
              {/* POS */}
              <button
                onClick={() => openDrawer('pos')}
                className="rounded-xl border bg-white p-4 shadow-sm text-left hover:border-blue-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-blue-600" />
                    <h3 className="font-semibold text-slate-800">POS</h3>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-1.5 text-slate-500">รายได้</td>
                      <td className="py-1.5 text-right font-medium">{formatThaiMoney(data.pos.revenue)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">ต้นทุนสินค้า (COGS)</td>
                      <td className="py-1.5 text-right font-medium text-red-600">− {formatThaiMoney(data.pos.cogs)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5">กำไรขั้นต้น</td>
                      <td className={`py-1.5 text-right ${profitColor(data.pos.profit)}`}>
                        {formatThaiMoney(data.pos.profit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </button>

              {/* Repair */}
              <button
                onClick={() => openDrawer('repair')}
                className="rounded-xl border bg-white p-4 shadow-sm text-left hover:border-purple-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-purple-600" />
                    <h3 className="font-semibold text-slate-800">งานซ่อม ({data.repair.count} งาน)</h3>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-purple-400 transition-colors" />
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-1.5 text-slate-500">รายได้ซ่อม</td>
                      <td className="py-1.5 text-right font-medium">{formatThaiMoney(data.repair.revenue)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">ค่าอะไหล่</td>
                      <td className="py-1.5 text-right font-medium text-red-600">− {formatThaiMoney(data.repair.partsCost)}</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 text-slate-500">ค่าแรง</td>
                      <td className="py-1.5 text-right font-medium text-red-600">− {formatThaiMoney(data.repair.laborCost)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5">กำไรขั้นต้น</td>
                      <td className={`py-1.5 text-right ${profitColor(data.repair.profit)}`}>
                        {formatThaiMoney(data.repair.profit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </button>

              {/* Package */}
              <button
                onClick={() => openDrawer('package')}
                className="rounded-xl border bg-white p-4 shadow-sm text-left hover:border-teal-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-teal-600" />
                    <h3 className="font-semibold text-slate-800">Package ({data.package.count} รายการ)</h3>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-teal-400 transition-colors" />
                </div>
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-1.5 text-slate-500">ยอด Package</td>
                      <td className="py-1.5 text-right font-medium">{formatThaiMoney(data.package.revenue)}</td>
                    </tr>
                    <tr className="font-semibold">
                      <td className="py-1.5">กำไร</td>
                      <td className={`py-1.5 text-right ${profitColor(data.package.profit)}`}>
                        {formatThaiMoney(data.package.profit)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </button>

              {/* Expense */}
              <button
                onClick={() => openDrawer('expense')}
                className="rounded-xl border bg-white p-4 shadow-sm text-left hover:border-orange-300 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-orange-600" />
                    <h3 className="font-semibold text-slate-800">ค่าใช้จ่าย</h3>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-orange-400 transition-colors" />
                </div>
                {data.expenses.breakdown.length === 0 ? (
                  <p className="text-sm text-slate-400">ไม่มีค่าใช้จ่ายในช่วงนี้</p>
                ) : (
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-slate-100">
                      {data.expenses.breakdown.map((exp) => (
                        <tr key={exp.code}>
                          <td className="py-1.5 text-slate-600">{exp.name}</td>
                          <td className="py-1.5 text-right font-medium text-red-600">
                            − {formatThaiMoney(exp.total)}
                          </td>
                        </tr>
                      ))}
                      <tr className="font-semibold border-t border-slate-200">
                        <td className="py-1.5">รวม</td>
                        <td className="py-1.5 text-right text-red-600">− {formatThaiMoney(data.expenses.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </button>
            </div>

            {/* Net Profit summary — clickable */}
            <button
              onClick={() => openDrawer('net')}
              className={`w-full rounded-xl border-2 p-5 text-left hover:shadow-md transition-shadow group ${netPositive ? 'border-green-400 bg-green-50 hover:border-green-500' : 'border-red-400 bg-red-50 hover:border-red-500'}`}
            >
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <p className="text-sm font-medium text-slate-600">Net Profit (กำไรสุทธิ)</p>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    Gross Profit − ค่าใช้จ่าย
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300 group-hover:text-slate-500 transition-colors" />
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-2xl font-bold ${netPositive ? 'text-green-700' : 'text-red-700'}`}>
                    {formatThaiMoney(data.summary.netProfit)}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    Net margin {data.summary.netMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm border-t border-current/20 pt-3">
                <div>
                  <p className="text-slate-500 text-xs">Gross Profit</p>
                  <p className={`font-semibold ${data.summary.grossProfit >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {formatThaiMoney(data.summary.grossProfit)}
                  </p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">ค่าใช้จ่าย</p>
                  <p className="font-semibold text-orange-700">− {formatThaiMoney(data.expenses.total)}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Net Margin</p>
                  <p className={`font-semibold ${netPositive ? 'text-green-700' : 'text-red-700'}`}>
                    {data.summary.netMargin.toFixed(1)}%
                  </p>
                </div>
              </div>
            </button>
          </>
        )}
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
