'use client'

import { useState, useMemo, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format, subDays } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  RefreshCw, Printer, Download, ChevronLeft, ChevronRight as ChevronRightIcon,
  ShoppingCart, Wrench, Wifi, TrendingUp, TrendingDown,
  AlertTriangle, Clock, Package, Users, ChevronRight,
  Banknote, Smartphone, CreditCard,
  BarChart2, Award, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import { PageHeader } from '@/components/ui/page-header'
import api from '@/lib/api'
import { DrillDrawer, MetricCard } from '@/components/reports/drill-drawer'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DailyClosingReport {
  date: string
  revenue: {
    pos: { total: number; count: number; breakdown: Record<string, number> }
    repairs: { total: number; count: number; breakdown: Record<string, number> }
    packages: { total: number; amount: number; count: number }
    refunds: { total: number; count: number }
    voided: { total: number; count: number }
    deposits: { total: number }
    outstanding: { total: number; count: number }
    grandTotal: number
    cash: number
    transfer: number
    card: number
  }
  sales: { items: any[]; count: number }
  voidedSales: { items: any[]; count: number }
  refunds: { items: any[]; count: number }
  repairPayments: { items: any[]; count: number }
  packageSales: { items: any[]; count: number }
  repairSummary: {
    new: number
    byStatus: Record<string, number>
    overdue: number
    items: any[]
    overdueItems: any[]
  }
  unpaidRepairs: { items: any[]; count: number; total: number }
  shifts: { items: ShiftRow[] }
  expenses: {
    items: any[]
    count: number
    totalAmount: number
    byCategory: Array<{ categoryId: string; categoryName: string; total: number; count: number }>
  }
  lowStock: { items: any[]; count: number }
  performance: {
    topProducts: { productId: string; name: string; sku: string; qty: number; revenue: number }[]
    topStaff: { id: string; name: string; role: string; salesCount: number; salesRevenue: number; repairCount: number; repairRevenue: number }[]
  }
}

interface ShiftRow {
  id: string
  openedAt: string
  closedAt?: string
  isActive: boolean
  openBalance: number
  closeBalance?: number
  cashIn: number
  cashExpenses: number
  expectedBalance: number
  difference: number | null
  user: { id: string; name: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

const STATUS_LABEL: Record<string, string> = {
  RECEIVED: 'รับงาน', DIAGNOSING: 'ตรวจสอบ', WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
  APPROVED: 'อนุมัติแล้ว', WAITING_PARTS: 'รออะไหล่', IN_PROGRESS: 'กำลังซ่อม',
  COMPLETED: 'ซ่อมเสร็จ', DELIVERED: 'ส่งคืนแล้ว', CANCELLED: 'ยกเลิก',
}
const PM_LABEL: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' }
const PM_ICON: Record<string, React.ElementType> = { CASH: Banknote, TRANSFER: Smartphone, CARD: CreditCard }


// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string | number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-slate-600 dark:text-slate-400" />
      </div>
      <h2 className="font-bold text-gray-900 dark:text-white">{title}</h2>
      {badge !== undefined && badge !== 0 && (
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
          {badge}
        </span>
      )}
    </div>
  )
}

// ── CSV Export ────────────────────────────────────────────────────────────────

function exportCSV(data: DailyClosingReport, date: string) {
  const rows: string[][] = [
    ['รายงานปิดวัน', date],
    [],
    ['สรุปรายได้'],
    ['ขายสินค้า (POS)', String(data.revenue.pos.total)],
    ['รายได้ซ่อม', String(data.revenue.repairs.total)],
    ['ขาย SIM/Net', String(data.revenue.packages.total)],
    ['รวมรายได้', String(data.revenue.grandTotal)],
    ['เงินสด', String(data.revenue.cash)],
    ['โอน', String(data.revenue.transfer)],
    ['บัตร', String(data.revenue.card)],
    [],
    ['รายการขาย POS'],
    ['เวลา', 'เลขใบเสร็จ', 'ลูกค้า', 'ยอด', 'ช่องทาง', 'พนักงาน'],
    ...data.sales.items.map((s: any) => [
      format(new Date(s.createdAt), 'HH:mm', { locale: th }),
      s.receiptNumber,
      s.customer?.name ?? '-',
      String(Number(s.total)),
      PM_LABEL[s.paymentMethod] ?? s.paymentMethod,
      s.user?.name ?? '-',
    ]),
    [],
    ['รายการรับเงินซ่อม'],
    ['เวลา', 'เลขงาน', 'ลูกค้า', 'ยอด', 'ช่องทาง'],
    ...data.repairPayments.items.map((r: any) => [
      r.paidAt ? format(new Date(r.paidAt), 'HH:mm', { locale: th }) : '-',
      r.ticketNumber,
      r.customer?.name ?? '-',
      String(Number(r.paidAmount ?? 0)),
      PM_LABEL[r.paymentMethod] ?? r.paymentMethod,
    ]),
    [],
    ['ค่าใช้จ่าย'],
    ['หมวดหมู่', 'รายการ', 'ช่องทาง', 'อ้างอิง', 'จำนวน', 'ผู้บันทึก'],
    ...data.expenses.items.map((e: any) => [
      e.category?.name ?? '-',
      e.description,
      PM_LABEL[e.paymentMethod] ?? e.paymentMethod,
      e.referenceNo ?? '-',
      String(Number(e.amount)),
      e.createdBy?.name ?? '-',
    ]),
    ['รวมค่าใช้จ่าย', String(data.expenses.totalAmount)],
  ]

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
  const bom = '﻿'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ปิดวัน-${date}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function DailyClosingReportPage() {
  const { user, hasPermission, hasModule } = useAuthStore()
  const isOwnerOrManager = user?.role === 'OWNER' || user?.role === 'MANAGER' || hasPermission('reports.view')

  const [dateStr, setDateStr] = useState(todayStr)
  const [drawer, setDrawer] = useState<{ title: string; content: React.ReactNode } | null>(null)

  const { data, isLoading, refetch, isRefetching } = useQuery<DailyClosingReport>({
    queryKey: ['daily-closing', dateStr],
    queryFn: async () => (await api.get('/reports/daily-closing', { params: { date: dateStr } })).data,
    enabled: isOwnerOrManager,
  })

  const openDrawer = useCallback((title: string, content: React.ReactNode) => {
    setDrawer({ title, content })
  }, [])

  // Sales list table for drawer
  const salesDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.sales.count} รายการ · {formatThaiMoney(data.revenue.pos.total)}</p>
        {data.sales.items.map((s: any) => {
          const PMIcon = PM_ICON[s.paymentMethod] ?? PM_ICON.CASH
          return (
            <div key={s.id} className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">{s.receiptNumber}</span>
                <div className="flex items-center gap-1.5">
                  <PMIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-bold text-sm tabular-nums">{formatThaiMoney(Number(s.total))}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{format(new Date(s.createdAt), 'HH:mm', { locale: th })} · {s.user?.name ?? '-'}</span>
                <span>{s.customer?.name ?? 'ลูกค้าทั่วไป'}</span>
              </div>
            </div>
          )
        })}
        {data.sales.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีรายการ</p>}
      </div>
    )
  }, [data])

  const repairPayDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.repairPayments.count} รายการ · {formatThaiMoney(data.revenue.repairs.total)}</p>
        {data.repairPayments.items.map((r: any) => {
          const PMIcon = PM_ICON[r.paymentMethod] ?? PM_ICON.CASH
          return (
            <div key={r.id} className="bg-gray-50 rounded-xl p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-blue-700">{r.ticketNumber}</span>
                <div className="flex items-center gap-1.5">
                  <PMIcon className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-bold text-sm tabular-nums">{formatThaiMoney(Number(r.paidAmount ?? 0))}</span>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{r.paidAt ? format(new Date(r.paidAt), 'HH:mm', { locale: th }) : '-'}</span>
                <span>{r.customer?.name ?? '-'}</span>
              </div>
            </div>
          )
        })}
        {data.repairPayments.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีรายการ</p>}
      </div>
    )
  }, [data])

  const packageDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.packageSales.count} รายการ · {formatThaiMoney(data.revenue.packages.total)}</p>
        {data.packageSales.items.map((p: any) => (
          <div key={p.id} className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-700">{p.receiptNumber}</span>
              <span className="font-bold text-sm tabular-nums">{formatThaiMoney(Number(p.profit))}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{p.carrier} · {format(new Date(p.createdAt), 'HH:mm', { locale: th })}</span>
              <span>฿{Number(p.packageAmount).toLocaleString()}</span>
            </div>
          </div>
        ))}
        {data.packageSales.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีรายการ</p>}
      </div>
    )
  }, [data])

  const voidDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        {data.voidedSales.items.map((s: any) => (
          <div key={s.id} className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-red-700">{s.receiptNumber}</span>
              <span className="font-bold text-sm tabular-nums text-red-700">{formatThaiMoney(Number(s.total))}</span>
            </div>
            <p className="text-xs text-muted-foreground">{s.voidReason ?? '-'}</p>
            <p className="text-xs text-muted-foreground">ยกเลิกโดย: {s.voidedBy?.name ?? s.user?.name ?? '-'}</p>
          </div>
        ))}
        {data.voidedSales.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีบิลยกเลิก</p>}
      </div>
    )
  }, [data])

  const refundDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        {data.refunds.items.map((r: any) => (
          <div key={r.id} className="bg-orange-50 border border-orange-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-orange-700">{r.refundNumber}</span>
              <span className="font-bold text-sm tabular-nums text-orange-700">{formatThaiMoney(Number(r.totalRefund))}</span>
            </div>
            <p className="text-xs text-muted-foreground">บิล: {r.sale?.receiptNumber ?? '-'} · {r.reason}</p>
            <p className="text-xs text-muted-foreground">โดย: {r.createdBy?.name ?? '-'}</p>
          </div>
        ))}
        {data.refunds.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีการคืนเงิน</p>}
      </div>
    )
  }, [data])

  const overdueDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        {data.repairSummary.overdueItems.map((r: any) => (
          <div key={r.id} className="bg-red-50 border border-red-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-red-700">{r.ticketNumber}</span>
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                {STATUS_LABEL[r.status] ?? r.status}
              </span>
            </div>
            <p className="text-sm font-medium">{r.deviceBrand} {r.deviceModel}</p>
            <p className="text-xs text-muted-foreground">
              {r.customer?.name ?? '-'} · ครบกำหนด {r.dueDate ? format(new Date(r.dueDate), 'dd/MM/yy', { locale: th }) : '-'}
            </p>
          </div>
        ))}
        {data.repairSummary.overdueItems.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีงานเกินกำหนด</p>}
      </div>
    )
  }, [data])

  const unpaidDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.unpaidRepairs.count} งาน · ค้างรวม {formatThaiMoney(data.unpaidRepairs.total)}</p>
        {data.unpaidRepairs.items.map((r: any) => (
          <div key={r.id} className="bg-amber-50 border border-amber-100 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs font-bold text-amber-700">{r.ticketNumber}</span>
              <span className="font-bold text-sm tabular-nums">
                {formatThaiMoney(Math.max(0, Number(r.finalCost ?? r.estimateCost ?? 0) - Number(r.deposit ?? 0)))}
              </span>
            </div>
            <p className="text-sm font-medium">{r.deviceBrand} {r.deviceModel}</p>
            <p className="text-xs text-muted-foreground">{r.customer?.name ?? '-'}</p>
          </div>
        ))}
        {data.unpaidRepairs.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีหนี้ค้างชำระ</p>}
      </div>
    )
  }, [data])

  const lowStockDrawer = useMemo(() => {
    if (!data) return null
    return (
      <div className="space-y-2">
        {data.lowStock.items.map((p: any) => (
          <div key={p.id} className="bg-orange-50 border border-orange-100 rounded-xl p-3 flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.sku}</p>
            </div>
            <div className="text-right">
              <p className={`font-bold text-sm ${p.stock === 0 ? 'text-red-600' : 'text-orange-600'}`}>
                {p.stock} ชิ้น
              </p>
              <p className="text-xs text-muted-foreground">ขั้นต่ำ {p.minStock}</p>
            </div>
          </div>
        ))}
        {data.lowStock.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">สต็อกปกติทุกรายการ</p>}
      </div>
    )
  }, [data])

  const expenseDrawer = useMemo(() => {
    if (!data) return null
    const PM_LABEL_LOCAL: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' }
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.expenses.count} รายการ · {formatThaiMoney(data.expenses.totalAmount)}</p>
        {data.expenses.items.map((e: any) => (
          <div key={e.id} className="bg-gray-50 rounded-xl p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">{e.category?.name ?? '-'}</span>
              <span className="font-bold text-sm tabular-nums">{formatThaiMoney(Number(e.amount))}</span>
            </div>
            <p className="text-sm">{e.description}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{PM_LABEL_LOCAL[e.paymentMethod] ?? e.paymentMethod}</span>
              <span>{e.createdBy?.name ?? '-'}</span>
            </div>
          </div>
        ))}
        {data.expenses.count === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีค่าใช้จ่าย</p>}
      </div>
    )
  }, [data])

  const repairStatusDrawer = useCallback((status: string) => {
    if (!data) return null
    const items = data.repairSummary.items.filter((r: any) => r.status === status)
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{items.length} งาน</p>
        {items.map((r: any) => (
          <div key={r.id} className="bg-gray-50 rounded-xl p-3 space-y-1">
            <span className="font-mono text-xs font-bold text-blue-700">{r.ticketNumber}</span>
            <p className="text-sm font-medium">{r.deviceBrand} {r.deviceModel}</p>
            <p className="text-xs text-muted-foreground">{r.customer?.name ?? '-'}</p>
          </div>
        ))}
        {items.length === 0 && <p className="text-center text-sm text-muted-foreground py-4">ไม่มีงาน</p>}
      </div>
    )
  }, [data])

  if (!hasModule('report')) return <ModuleGate module="report">{null}</ModuleGate>

  if (!isOwnerOrManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground">
        <AlertTriangle className="h-10 w-10 text-gray-200" />
        <p className="font-medium">ไม่มีสิทธิ์เข้าถึงรายงานนี้</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-5 pb-12 print:space-y-3">

        {/* ── Header ── */}
        <PageHeader
          title="รายงานปิดวัน"
          icon={BarChart2}
          subtitle="สรุปรายได้ · การซ่อม · กะ · แจ้งเตือน"
          className="print:hidden"
          secondaryActions={
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Quick date nav */}
              <button
                onClick={() => setDateStr(format(subDays(new Date(dateStr), 1), 'yyyy-MM-dd'))}
                className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors"
                title="วันก่อน"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setDateStr(todayStr())}
                className={`h-7 px-2.5 rounded border text-xs font-medium transition-colors ${dateStr === todayStr() ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                วันนี้
              </button>
              <button
                onClick={() => setDateStr(format(subDays(new Date(), 1), 'yyyy-MM-dd'))}
                className={`h-7 px-2.5 rounded border text-xs font-medium transition-colors ${dateStr === format(subDays(new Date(), 1), 'yyyy-MM-dd') ? 'bg-blue-600 text-white border-blue-600' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                เมื่อวาน
              </button>
              <button
                onClick={() => {
                  if (dateStr < todayStr()) setDateStr(format(new Date(new Date(dateStr).getTime() + 86400000), 'yyyy-MM-dd'))
                }}
                disabled={dateStr >= todayStr()}
                className="h-7 w-7 flex items-center justify-center rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="วันถัดไป"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
              <input
                type="date"
                value={dateStr}
                max={todayStr()}
                onChange={(e) => setDateStr(e.target.value)}
                className="h-7 px-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          }
          primaryAction={
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isRefetching} className="gap-1.5">
                <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.print()} className="gap-1.5">
                <Printer className="h-3.5 w-3.5" />พิมพ์
              </Button>
              {data && (
                <Button size="sm" variant="outline" onClick={() => exportCSV(data, dateStr)} className="gap-1.5">
                  <Download className="h-3.5 w-3.5" />CSV
                </Button>
              )}
            </div>
          }
        />

        {/* Print header */}
        <div className="hidden print:block border-b pb-3 mb-4">
          <h1 className="text-xl font-bold">รายงานปิดวัน — {dateStr}</h1>
          <p className="text-sm text-muted-foreground">พิมพ์เมื่อ {format(new Date(), 'dd/MM/yyyy HH:mm', { locale: th })}</p>
        </div>

        {isLoading && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-24 bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 animate-pulse" />
            ))}
          </div>
        )}

        {data && (
          <>
            {/* ── 1. Revenue Summary ── */}
            <section>
              <SectionHeader icon={TrendingUp} title={dateStr === todayStr() ? 'สรุปรายได้วันนี้' : `สรุปรายได้ — ${format(new Date(dateStr + 'T12:00:00'), 'd MMM yyyy', { locale: th })}`} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="ขายสินค้า (POS)"
                  value={formatThaiMoney(data.revenue.pos.total)}
                  sub={`${data.revenue.pos.count} รายการ`}
                  color="text-green-700"
                  icon={ShoppingCart}
                  onClick={() => openDrawer('รายการขาย POS', salesDrawer)}
                />
                <MetricCard
                  label="รายได้ซ่อม"
                  value={formatThaiMoney(data.revenue.repairs.total)}
                  sub={`${data.revenue.repairs.count} งาน`}
                  color="text-blue-700"
                  icon={Wrench}
                  onClick={() => openDrawer('รายการรับเงินซ่อม', repairPayDrawer)}
                />
                <MetricCard
                  label="ขาย SIM/Net"
                  value={formatThaiMoney(data.revenue.packages.total)}
                  sub={`${data.revenue.packages.count} รายการ`}
                  color="text-cyan-700"
                  icon={Wifi}
                  onClick={() => openDrawer('รายการขาย SIM/Net', packageDrawer)}
                />
                <MetricCard
                  label="รวมรายได้"
                  value={formatThaiMoney(data.revenue.grandTotal)}
                  color="text-gray-900"
                  icon={BarChart2}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <MetricCard
                  label="เงินสด"
                  value={formatThaiMoney(data.revenue.cash)}
                  icon={Banknote}
                />
                <MetricCard
                  label="โอนเงิน"
                  value={formatThaiMoney(data.revenue.transfer)}
                  icon={Smartphone}
                />
                <MetricCard
                  label="บัตรเครดิต"
                  value={formatThaiMoney(data.revenue.card)}
                  icon={CreditCard}
                />
                <MetricCard
                  label="มัดจำรับวันนี้"
                  value={formatThaiMoney(data.revenue.deposits.total)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3 mt-3">
                <MetricCard
                  label="หนี้ค้างชำระ"
                  value={formatThaiMoney(data.revenue.outstanding.total)}
                  sub={`${data.revenue.outstanding.count} งาน`}
                  color="text-amber-700"
                  onClick={() => openDrawer('หนี้ค้างชำระ (ซ่อมเสร็จยังไม่ชำระ)', unpaidDrawer)}
                />
                <MetricCard
                  label="คืนเงิน (Refund)"
                  value={formatThaiMoney(data.revenue.refunds.total)}
                  sub={`${data.revenue.refunds.count} รายการ`}
                  color="text-orange-700"
                  onClick={() => openDrawer('รายการคืนเงิน', refundDrawer)}
                />
              </div>
            </section>

            {/* ── 2. Sales Transactions ── */}
            <section className="print:break-inside-avoid">
              <SectionHeader icon={ShoppingCart} title="รายการขาย POS" badge={data.sales.count} />
              <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                        <th className="text-left px-4 py-2.5 font-medium">เวลา</th>
                        <th className="text-left px-4 py-2.5 font-medium">ใบเสร็จ</th>
                        <th className="text-left px-4 py-2.5 font-medium">ลูกค้า</th>
                        <th className="text-left px-4 py-2.5 font-medium hidden sm:table-cell">พนักงาน</th>
                        <th className="text-right px-4 py-2.5 font-medium">ยอด</th>
                        <th className="text-left px-4 py-2.5 font-medium">ช่องทาง</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.sales.items.map((s: any) => {
                        const PMIcon = PM_ICON[s.paymentMethod] ?? PM_ICON.CASH
                        return (
                          <tr key={s.id} className="border-b dark:border-slate-800 last:border-0 hover:bg-gray-50/60 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(s.createdAt), 'HH:mm', { locale: th })}
                            </td>
                            <td className="px-4 py-2.5 font-mono text-xs font-semibold text-blue-700">{s.receiptNumber}</td>
                            <td className="px-4 py-2.5 text-xs">{s.customer?.name ?? 'ลูกค้าทั่วไป'}</td>
                            <td className="px-4 py-2.5 text-xs hidden sm:table-cell text-muted-foreground">{s.user?.name ?? '-'}</td>
                            <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatThaiMoney(Number(s.total))}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center gap-1">
                                <PMIcon className="h-3.5 w-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{PM_LABEL[s.paymentMethod] ?? s.paymentMethod}</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {data.sales.count === 0 && (
                        <tr><td colSpan={6} className="text-center py-6 text-sm text-muted-foreground">ไม่มีรายการขาย</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>

            {/* ── 3. Repair Summary ── */}
            <section className="print:break-inside-avoid">
              <SectionHeader icon={Wrench} title="สรุปงานซ่อม" />
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { key: 'RECEIVED', label: 'รับวันนี้', val: data.repairSummary.new },
                  { key: 'IN_PROGRESS', label: 'กำลังซ่อม', val: data.repairSummary.byStatus['IN_PROGRESS'] ?? 0 },
                  { key: 'WAITING_PARTS', label: 'รออะไหล่', val: data.repairSummary.byStatus['WAITING_PARTS'] ?? 0 },
                  { key: 'WAITING_APPROVAL', label: 'รออนุมัติ', val: data.repairSummary.byStatus['WAITING_APPROVAL'] ?? 0 },
                  { key: 'COMPLETED', label: 'ซ่อมเสร็จ', val: data.repairSummary.byStatus['COMPLETED'] ?? 0 },
                  { key: 'OVERDUE', label: 'เกินกำหนด', val: data.repairSummary.overdue },
                ].map(({ key, label, val }) => (
                  <button
                    key={key}
                    onClick={() => {
                      if (key === 'OVERDUE') {
                        openDrawer('งานซ่อมเกินกำหนด', overdueDrawer)
                      } else if (key === 'RECEIVED') {
                        openDrawer('งานซ่อมรับวันนี้', repairStatusDrawer('RECEIVED'))
                      } else {
                        openDrawer(`งาน: ${label}`, repairStatusDrawer(key))
                      }
                    }}
                    className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-3 text-center hover:border-blue-300 hover:shadow-sm transition-all group"
                  >
                    <p className={`text-2xl font-bold tabular-nums ${key === 'OVERDUE' ? 'text-red-600' : 'text-gray-900'}`}>{val}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 mx-auto mt-1 transition-opacity" />
                  </button>
                ))}
              </div>
            </section>

            {/* ── 4. Shift Summary ── */}
            <section className="print:break-inside-avoid">
              <SectionHeader icon={Clock} title="สรุปกะ" badge={data.shifts.items.length} />
              <div className="space-y-3">
                {data.shifts.items.length === 0 && (
                  <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-4 text-center text-sm text-muted-foreground">ไม่มีข้อมูลกะ</div>
                )}
                {data.shifts.items.map((shift) => (
                  <div key={shift.id} className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-gray-900 dark:text-white">{shift.user.name}</p>
                        <p className="text-xs text-muted-foreground">
                          เปิด {format(new Date(shift.openedAt), 'HH:mm', { locale: th })}
                          {shift.closedAt && ` · ปิด ${format(new Date(shift.closedAt), 'HH:mm', { locale: th })}`}
                          {shift.isActive && <span className="ml-1.5 text-green-600 font-semibold">(ยังเปิดอยู่)</span>}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">เปิดกะ</p>
                        <p className="font-semibold tabular-nums">{formatThaiMoney(shift.openBalance)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">รับเงินสด</p>
                        <p className="font-semibold tabular-nums text-green-700">+{formatThaiMoney(shift.cashIn)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">จ่ายค่าใช้จ่าย</p>
                        <p className={`font-semibold tabular-nums ${(shift.cashExpenses ?? 0) > 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                          {(shift.cashExpenses ?? 0) > 0 ? `-${formatThaiMoney(shift.cashExpenses)}` : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">ยอดเงินคาด</p>
                        <p className="font-semibold tabular-nums">{formatThaiMoney(shift.expectedBalance)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {shift.isActive ? 'ยังไม่ปิดกะ' : 'ส่วนต่าง'}
                        </p>
                        {shift.difference !== null ? (
                          <p className={`font-bold tabular-nums ${
                            shift.difference === 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {shift.difference >= 0 ? '+' : ''}{formatThaiMoney(shift.difference)}
                          </p>
                        ) : (
                          <p className="text-muted-foreground text-sm">—</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* ── 5. Expenses ── */}
            <section className="print:break-inside-avoid">
              <SectionHeader icon={Receipt} title="ค่าใช้จ่ายวันนี้" badge={data.expenses.count} />
              {data.expenses.byCategory.length > 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-4 space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {data.expenses.byCategory.slice(0, 4).map((c) => (
                      <button
                        key={c.categoryId}
                        onClick={() => openDrawer('ค่าใช้จ่ายวันนี้', expenseDrawer)}
                        className="text-left bg-gray-50 rounded-xl p-3 hover:bg-orange-50 hover:border-orange-200 border border-transparent transition-all"
                      >
                        <p className="text-xs text-muted-foreground truncate">{c.categoryName}</p>
                        <p className="font-bold tabular-nums text-orange-700 mt-0.5">{formatThaiMoney(c.total)}</p>
                        <p className="text-xs text-muted-foreground">{c.count} รายการ</p>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t dark:border-slate-700">
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-200">รวมค่าใช้จ่ายทั้งหมด</span>
                    <button
                      onClick={() => openDrawer('ค่าใช้จ่ายวันนี้', expenseDrawer)}
                      className="flex items-center gap-1 font-bold text-orange-700 tabular-nums hover:underline"
                    >
                      {formatThaiMoney(data.expenses.totalAmount)}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-4 text-center text-sm text-muted-foreground">
                  ไม่มีค่าใช้จ่ายที่บันทึกในวันนี้
                </div>
              )}
            </section>

            {/* ── 6. Risk / Alerts (was 5) ── */}
            <section className="print:break-inside-avoid">
              <SectionHeader icon={AlertTriangle} title="แจ้งเตือนความเสี่ยง" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="บิลยกเลิก"
                  value={String(data.revenue.voided.count)}
                  sub={data.revenue.voided.count > 0 ? formatThaiMoney(data.revenue.voided.total) : undefined}
                  color={data.revenue.voided.count > 0 ? 'text-red-600' : 'text-gray-500'}
                  onClick={() => openDrawer('บิลที่ถูกยกเลิก', voidDrawer)}
                />
                <MetricCard
                  label="คืนเงิน"
                  value={String(data.revenue.refunds.count)}
                  sub={data.revenue.refunds.count > 0 ? formatThaiMoney(data.revenue.refunds.total) : undefined}
                  color={data.revenue.refunds.count > 0 ? 'text-orange-600' : 'text-gray-500'}
                  onClick={() => openDrawer('รายการคืนเงิน', refundDrawer)}
                />
                <MetricCard
                  label="งานซ่อมเกินกำหนด"
                  value={String(data.repairSummary.overdue)}
                  color={data.repairSummary.overdue > 0 ? 'text-red-600' : 'text-gray-500'}
                  onClick={() => openDrawer('งานซ่อมเกินกำหนด', overdueDrawer)}
                />
                <MetricCard
                  label="สินค้าใกล้หมด"
                  value={String(data.lowStock.count)}
                  color={data.lowStock.count > 0 ? 'text-orange-600' : 'text-gray-500'}
                  icon={Package}
                  onClick={() => openDrawer('สินค้าใกล้หมดสต็อก', lowStockDrawer)}
                />
              </div>
            </section>

            {/* ── 7. Top Performance (was 6) ── */}
            <section className="print:break-inside-avoid">
              <SectionHeader icon={Award} title="ผลงานวันนี้" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Top products */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">สินค้าขายดี</p>
                  <div className="space-y-2">
                    {data.performance.topProducts.slice(0, 5).map((p, idx) => (
                      <div key={p.productId} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.qty} ชิ้น</p>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-green-700">{formatThaiMoney(p.revenue)}</span>
                      </div>
                    ))}
                    {data.performance.topProducts.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">ยังไม่มีข้อมูล</p>
                    )}
                  </div>
                </div>

                {/* Staff performance */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-800 p-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">ผลงานพนักงาน</p>
                  <div className="space-y-2">
                    {data.performance.topStaff.slice(0, 5).map((s, idx) => (
                      <div key={s.id} className="flex items-center gap-3">
                        <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {s.salesCount > 0 && `ขาย ${s.salesCount} บิล`}
                            {s.repairCount > 0 && ` · ซ่อม ${s.repairCount} งาน`}
                          </p>
                        </div>
                        <span className="text-sm font-bold tabular-nums text-green-700">
                          {formatThaiMoney(s.salesRevenue + s.repairRevenue)}
                        </span>
                      </div>
                    ))}
                    {data.performance.topStaff.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-2">ยังไม่มีข้อมูล</p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </div>

      {/* Drill drawer */}
      {drawer && (
        <DrillDrawer title={drawer.title} onClose={() => setDrawer(null)}>
          {drawer.content}
        </DrillDrawer>
      )}

      {/* Print styles */}
      <style>{`
        @media print {
          body { font-size: 12px; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          button { pointer-events: none; }
        }
      `}</style>
    </>
  )
}
