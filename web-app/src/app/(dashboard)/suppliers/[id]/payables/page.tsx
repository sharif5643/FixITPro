'use client'

import { useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ChevronLeft, ChevronRight, Building2, AlertTriangle,
  TrendingDown, ArrowUpRight, ArrowDownLeft, Wallet,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { SupplierStatement, SupplierStatementPO, POPaymentStatus } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────

const PAY_STATUS_CFG: Record<POPaymentStatus, { label: string; cls: string }> = {
  UNPAID:       { label: 'ยังไม่จ่าย',   cls: 'bg-red-100 text-red-700 border-red-200' },
  PARTIAL_PAID: { label: 'จ่ายบางส่วน', cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  PAID:         { label: 'จ่ายครบ',      cls: 'bg-green-100 text-green-700 border-green-200' },
}

function agingBucket(daysOverdue: number): { label: string; cls: string } {
  if (daysOverdue === 0)       return { label: 'ปัจจุบัน',      cls: 'bg-green-100 text-green-700' }
  if (daysOverdue <= 30)       return { label: '1–30 วัน',    cls: 'bg-yellow-100 text-yellow-700' }
  if (daysOverdue <= 60)       return { label: '31–60 วัน',   cls: 'bg-orange-100 text-orange-700' }
  if (daysOverdue <= 90)       return { label: '61–90 วัน',   cls: 'bg-red-100 text-red-600' }
  return                               { label: '90+ วัน',    cls: 'bg-red-200 text-red-800 font-bold' }
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—'
  return format(new Date(s), 'd MMM yyyy', { locale: th })
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accent = 'slate',
}: {
  label: string; value: string; sub?: string
  icon: React.ElementType
  accent?: 'slate' | 'blue' | 'green' | 'amber' | 'red'
}) {
  const bg = { slate: 'bg-white', blue: 'bg-blue-50', green: 'bg-green-50', amber: 'bg-amber-50', red: 'bg-red-50' }
  const ic = { slate: 'text-slate-500 bg-slate-100', blue: 'text-blue-600 bg-blue-100', green: 'text-green-600 bg-green-100', amber: 'text-amber-600 bg-amber-100', red: 'text-red-600 bg-red-100' }
  const vc = { slate: 'text-slate-900', blue: 'text-blue-700', green: 'text-green-700', amber: 'text-amber-700', red: 'text-red-700' }
  return (
    <div className={cn('rounded-xl border p-4 space-y-2', bg[accent])}>
      <div className="flex items-center gap-2">
        <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', ic[accent])}>
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-xs text-slate-500 font-medium leading-tight">{label}</p>
      </div>
      <p className={cn('text-2xl font-bold tabular-nums', vc[accent])}>{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SupplierPayablesPage() {
  const params    = useParams<{ id: string }>()
  const router    = useRouter()
  const supplierId = params.id

  const [refMonth, setRefMonth] = useState(() => new Date())

  const startDate = format(startOfMonth(refMonth), 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(refMonth),   'yyyy-MM-dd')

  const { data, isLoading } = useQuery<SupplierStatement>({
    queryKey: ['supplier-statement', supplierId, startDate, endDate],
    queryFn:  () =>
      api.get(`/suppliers/${supplierId}/statement`, { params: { startDate, endDate } }).then((r) => r.data),
    staleTime: 60_000,
  })

  const overduePos = useMemo(
    () => (data?.outstandingPos ?? []).filter((p) => p.daysOverdue > 0),
    [data],
  )

  const totalOutstanding = useMemo(
    () => (data?.outstandingPos ?? []).reduce((s, p) => s + p.balance, 0),
    [data],
  )

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  if (!data) return null

  const { supplier } = data

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" className="gap-1 -ml-2" onClick={() => router.push('/suppliers')}>
          <ChevronLeft className="h-4 w-4" />
          ซัพพลายเออร์
        </Button>
      </div>

      <PageHeader
        title={supplier.name}
        icon={Building2}
        subtitle={`บัญชีเจ้าหนี้${supplier.creditDays > 0 ? ` · เครดิต ${supplier.creditDays} วัน` : ''}`}
        breadcrumbs={[{ label: 'ซัพพลายเออร์', href: '/suppliers' }, { label: supplier.name }]}
        secondaryActions={
          <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-white w-fit">
            <button onClick={() => setRefMonth((m) => subMonths(m, 1))} className="p-1 hover:bg-slate-100 rounded">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium w-28 text-center">
              {format(refMonth, 'MMMM yyyy', { locale: th })}
            </span>
            <button
              onClick={() => setRefMonth((m) => addMonths(m, 1))}
              disabled={format(addMonths(refMonth, 1), 'yyyy-MM') > format(new Date(), 'yyyy-MM')}
              className="p-1 hover:bg-slate-100 rounded disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        }
      />

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="ยอดยกมา"
          value={formatThaiMoney(data.openingBalance)}
          icon={Wallet}
          accent="slate"
        />
        <KpiCard
          label="ซื้อในเดือน"
          value={formatThaiMoney(data.purchases)}
          icon={ArrowUpRight}
          accent="blue"
        />
        <KpiCard
          label="จ่ายในเดือน"
          value={formatThaiMoney(data.payments)}
          icon={ArrowDownLeft}
          accent="green"
        />
        <KpiCard
          label="ยอดคงค้าง"
          value={formatThaiMoney(data.closingBalance)}
          sub={`รวมทุก PO: ${formatThaiMoney(totalOutstanding)}`}
          icon={TrendingDown}
          accent={data.closingBalance > 0 ? 'amber' : 'slate'}
        />
      </div>

      {/* Overdue alert */}
      {overduePos.length > 0 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            มี {overduePos.length} รายการเกินกำหนดชำระ
            · ยอดรวม {formatThaiMoney(overduePos.reduce((s, p) => s + p.balance, 0))}
          </p>
        </div>
      )}

      {/* Outstanding POs */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">PO ค้างชำระทั้งหมด</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.outstandingPos.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">ไม่มี PO ค้างชำระ</p>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">เลข PO</th>
                      <th className="text-left px-4 py-2.5 font-medium">วันที่สั่ง</th>
                      <th className="text-left px-4 py-2.5 font-medium">ครบกำหนด</th>
                      <th className="text-right px-4 py-2.5 font-medium">มูลค่า</th>
                      <th className="text-right px-4 py-2.5 font-medium">จ่ายแล้ว</th>
                      <th className="text-right px-4 py-2.5 font-medium">คงเหลือ</th>
                      <th className="text-center px-4 py-2.5 font-medium">อายุหนี้</th>
                      <th className="text-center px-4 py-2.5 font-medium">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.outstandingPos.map((po) => {
                      const aging = agingBucket(po.daysOverdue)
                      const payStatus = PAY_STATUS_CFG[po.paymentStatus]
                      return (
                        <tr key={po.id} className="border-b last:border-0 hover:bg-slate-50/60">
                          <td className="px-4 py-3 font-mono text-xs font-bold text-blue-700">{po.poNumber}</td>
                          <td className="px-4 py-3 text-gray-600">{fmtDate(po.orderDate)}</td>
                          <td className="px-4 py-3 text-gray-600">
                            {po.dueDate ? (
                              <span className={cn(po.daysOverdue > 0 ? 'text-red-600 font-medium' : '')}>
                                {fmtDate(po.dueDate)}
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{formatThaiMoney(po.total)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-green-700">{formatThaiMoney(po.paidTotal)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-red-700">{formatThaiMoney(po.balance)}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', aging.cls)}>
                              {aging.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={cn('rounded-full border px-2 py-0.5 text-[11px] font-semibold', payStatus.cls)}>
                              {payStatus.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50">
                      <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-500">รวมคงค้าง</td>
                      <td className="px-4 py-2.5 text-right font-bold text-red-700 tabular-nums">
                        {formatThaiMoney(totalOutstanding)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y">
                {data.outstandingPos.map((po) => {
                  const aging = agingBucket(po.daysOverdue)
                  return (
                    <div key={po.id} className="p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-blue-700">{po.poNumber}</span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', aging.cls)}>
                          {aging.label}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">ครบกำหนด</span>
                        <span className={cn(po.daysOverdue > 0 ? 'text-red-600 font-medium' : '')}>
                          {fmtDate(po.dueDate)}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">คงเหลือ</span>
                        <span className="font-bold text-red-700">{formatThaiMoney(po.balance)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      {data.paymentHistory.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              ประวัติการจ่าย — {format(refMonth, 'MMMM yyyy', { locale: th })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {data.paymentHistory.map((p) => (
                <div key={p.id} className="px-4 py-3 flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium text-gray-800">{formatThaiMoney(p.amount)}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {fmtDate(p.paidAt)} · {p.poNumber}
                      {p.note && ` · ${p.note}`}
                    </p>
                  </div>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    {{ CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' }[p.paymentMethod] ?? p.paymentMethod}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
