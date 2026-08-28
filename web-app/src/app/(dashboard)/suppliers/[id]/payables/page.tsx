'use client'

import { use, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, CreditCard,
  ChevronLeft, ChevronRight, Printer, Loader2, AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/ui/section-card'
import { PageHeader } from '@/components/ui/page-header'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableEmptyRow,
} from '@/components/ui/data-table'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { SupplierStatement } from '@/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null): string {
  if (!d) return '—'
  try { return format(new Date(d), 'dd/MM/yyyy') }
  catch { return d }
}

function agingClass(days: number): string {
  if (days === 0) return 'text-slate-600 dark:text-slate-300'
  if (days <= 30)  return 'text-amber-600 dark:text-amber-400'
  if (days <= 60)  return 'text-orange-600 dark:text-orange-400'
  return 'text-red-600 dark:text-red-400'
}

const PAY_METHOD_LABEL: Record<string, string> = {
  CASH:     'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD:     'บัตร',
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function SupplierPayablesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [viewMonth, setViewMonth] = useState(() => startOfMonth(new Date()))
  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data: stmt, isLoading, isError } = useQuery<SupplierStatement>({
    queryKey: ['supplier-statement', id, startDate, endDate],
    queryFn:  () => api.get(`/suppliers/${id}/statement?startDate=${startDate}&endDate=${endDate}`).then(r => r.data),
    staleTime: 60_000,
  })

  const supplier = stmt?.supplier

  const handlePrint = () => {
    window.open(`/print/supplier-statement/${id}?startDate=${startDate}&endDate=${endDate}`, '_blank')
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/suppliers">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <PageHeader
          icon={Building2}
          title={supplier?.name ?? 'บัญชีเจ้าหนี้ซัพพลายเออร์'}
          subtitle="Supplier Statement — สรุปยอดซื้อ การชำระ และยอดค้างชำระ"
        />
      </div>

      {/* Supplier info card */}
      {supplier && (
        <SectionCard>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {supplier.phone && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Phone className="h-3.5 w-3.5" />{supplier.phone}
              </span>
            )}
            {supplier.email && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Mail className="h-3.5 w-3.5" />{supplier.email}
              </span>
            )}
            {supplier.address && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />{supplier.address}
              </span>
            )}
            {supplier.taxId && (
              <span className="flex items-center gap-1.5 text-muted-foreground">
                เลขผู้เสียภาษี: <span className="font-mono">{supplier.taxId}</span>
              </span>
            )}
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <CreditCard className="h-3.5 w-3.5" />เครดิต {supplier.creditDays} วัน
            </span>
          </div>
        </SectionCard>
      )}

      {/* Period controls */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setViewMonth(m => startOfMonth(subMonths(m, 1)))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="font-semibold text-slate-800 dark:text-slate-100 min-w-[140px] text-center">
            {format(viewMonth, 'MMMM yyyy', { locale: th })}
          </span>
          <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => setViewMonth(m => startOfMonth(addMonths(m, 1)))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handlePrint} disabled={!stmt}>
          <Printer className="h-4 w-4" />
          พิมพ์ Statement
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>กำลังโหลด...</span>
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center h-32 gap-2 text-red-600">
          <AlertCircle className="h-4 w-4" />
          <span>ไม่สามารถโหลดข้อมูลได้</span>
        </div>
      )}

      {stmt && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'ยอดยกมา',    value: stmt.openingBalance,  color: 'text-slate-700 dark:text-slate-200' },
              { label: 'ซื้อในงวด',   value: stmt.purchases,       color: 'text-amber-700 dark:text-amber-400' },
              { label: 'ชำระในงวด',  value: stmt.payments,        color: 'text-emerald-700 dark:text-emerald-400' },
              { label: 'ยอดคงเหลือ', value: stmt.closingBalance,  color: stmt.closingBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-200' },
            ].map(card => (
              <div key={card.label} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] px-4 py-3.5">
                <p className="text-xs text-muted-foreground mb-1">{card.label}</p>
                <p className={`tabular-nums font-bold text-lg leading-tight ${card.color}`}>
                  {formatThaiMoney(card.value)}
                </p>
              </div>
            ))}
          </div>

          {/* Outstanding POs */}
          <SectionCard noPadding>
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/60">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">ใบสั่งซื้อค้างชำระ</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700/60">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">เลขที่ PO</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">วันที่สั่ง</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">ครบกำหนด</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">ยอดรวม</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">ชำระแล้ว</th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">คงค้าง</th>
                    <th className="px-4 py-2.5 text-center text-xs font-semibold text-muted-foreground">เกินกำหนด</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.outstandingPos.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground italic">
                        ไม่มีรายการค้างชำระ
                      </td>
                    </tr>
                  ) : (
                    stmt.outstandingPos.map(po => (
                      <tr key={po.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">{po.poNumber}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(po.orderDate)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(po.dueDate)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm">{formatThaiMoney(po.total)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm text-emerald-700 dark:text-emerald-400">{formatThaiMoney(po.paidTotal)}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm font-semibold text-red-600 dark:text-red-400">{formatThaiMoney(po.balance)}</td>
                        <td className={`px-4 py-3 text-center text-sm font-medium ${agingClass(po.daysOverdue)}`}>
                          {po.daysOverdue === 0 ? '—' : `${po.daysOverdue} วัน`}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {stmt.outstandingPos.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60">
                      <td colSpan={5} className="px-4 py-2.5 text-sm font-bold text-slate-800 dark:text-slate-100">รวมค้างชำระ</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-red-600 dark:text-red-400">
                        {formatThaiMoney(stmt.outstandingPos.reduce((s, p) => s + p.balance, 0))}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </SectionCard>

          {/* Payment history */}
          {stmt.paymentHistory.length > 0 && (
            <SectionCard noPadding>
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/60">
                <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">ประวัติการชำระในงวดนี้</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700/60">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">วันที่ชำระ</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">อ้างอิง PO</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">วิธีชำระ</th>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-muted-foreground">หมายเหตุ</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-muted-foreground">จำนวน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stmt.paymentHistory.map(p => (
                      <tr key={p.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted-foreground">{fmtDate(p.paidAt)}</td>
                        <td className="px-4 py-3 font-mono text-sm text-slate-600 dark:text-slate-300">{p.poNumber}</td>
                        <td className="px-4 py-3 text-sm">{PAY_METHOD_LABEL[p.paymentMethod] ?? p.paymentMethod}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{p.note ?? '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          {formatThaiMoney(p.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60">
                      <td colSpan={4} className="px-4 py-2.5 text-sm font-bold">รวมชำระ</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-emerald-700 dark:text-emerald-400">
                        {formatThaiMoney(stmt.payments)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  )
}
