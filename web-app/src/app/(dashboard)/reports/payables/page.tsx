'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, Building2, AlertTriangle, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn, formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { SupplierAging, SupplierAgingRow } from '@/types'

// ── helpers ──────────────────────────────────────────────────────────────────

function BucketBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className="flex items-center gap-2 tabular-nums">
      <span className="w-28 text-right text-sm">{formatThaiMoney(value)}</span>
      <div className="flex-1 h-1.5 bg-slate-100 rounded-full min-w-[60px]">
        <div className="h-1.5 rounded-full bg-slate-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function severityColor(row: SupplierAgingRow): string {
  const overdue = row.b31to60 + row.b61to90 + row.b90plus
  if (row.b90plus > 0)        return 'border-l-4 border-l-red-500'
  if (row.b61to90 > 0)        return 'border-l-4 border-l-orange-400'
  if (row.b31to60 > 0)        return 'border-l-4 border-l-yellow-400'
  if (overdue === 0 && row.total > 0) return 'border-l-4 border-l-green-400'
  return ''
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierAgingPage() {
  const router = useRouter()

  const { data, isLoading, refetch, isRefetching } = useQuery<SupplierAging>({
    queryKey: ['supplier-aging'],
    queryFn:  () => api.get('/reports/supplier-aging').then((r) => r.data),
    staleTime: 2 * 60_000,
  })

  const hasOverdue90 = (data?.suppliers ?? []).some((s) => s.b90plus > 0)

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="รายงานเจ้าหนี้ (AP Aging)"
        icon={Building2}
        subtitle="ยอดค้างชำระแยกตามอายุหนี้ของซัพพลายเออร์"
        primaryAction={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching} className="gap-2">
            <RefreshCw className={cn('h-3.5 w-3.5', isRefetching && 'animate-spin')} />
            รีเฟรช
          </Button>
        }
      />

      {/* Global overdue alert */}
      {hasOverdue90 && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 font-medium">
            มีซัพพลายเออร์ที่มีหนี้เกิน 90 วัน — กรุณาติดต่อและจัดการโดยเร็ว
          </p>
        </div>
      )}

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'รวมทั้งหมด',    value: data.totals.total,   cls: 'col-span-2 md:col-span-1 font-bold' },
            { label: '0–30 วัน',    value: data.totals.b0to30,  cls: '' },
            { label: '31–60 วัน',   value: data.totals.b31to60, cls: '' },
            { label: '61–90 วัน',   value: data.totals.b61to90, cls: data.totals.b61to90 > 0 ? 'bg-orange-50 border-orange-200' : '' },
            { label: '90+ วัน',     value: data.totals.b90plus, cls: data.totals.b90plus > 0 ? 'bg-red-50 border-red-200 text-red-700' : '' },
          ].map(({ label, value, cls }) => (
            <div key={label} className={cn('rounded-xl border p-3.5 bg-white', cls)}>
              <p className="text-xs text-slate-500 mb-1">{label}</p>
              <p className="text-lg font-bold tabular-nums">{formatThaiMoney(value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Supplier table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">แยกตามซัพพลายเออร์</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : !data || data.suppliers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-muted-foreground">
              <Building2 className="h-8 w-8 opacity-30" />
              <p className="text-sm">ไม่มียอดค้างชำระ</p>
            </div>
          ) : (
            <>
              {/* Desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-gray-500 text-xs">
                      <th className="text-left px-4 py-2.5 font-medium">ซัพพลายเออร์</th>
                      <th className="text-right px-4 py-2.5 font-medium">0–30 วัน</th>
                      <th className="text-right px-4 py-2.5 font-medium">31–60 วัน</th>
                      <th className="text-right px-4 py-2.5 font-medium">61–90 วัน</th>
                      <th className="text-right px-4 py-2.5 font-medium">90+ วัน</th>
                      <th className="text-right px-4 py-2.5 font-medium">รวม</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.suppliers.map((s) => (
                      <tr key={s.id} className={cn('border-b last:border-0 hover:bg-slate-50/60', severityColor(s))}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900">{s.name}</p>
                          {s.creditDays > 0 && (
                            <p className="text-xs text-slate-400">เครดิต {s.creditDays} วัน</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{s.b0to30 > 0 ? formatThaiMoney(s.b0to30) : '—'}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.b31to60 > 0 ? <span className="text-yellow-700 font-medium">{formatThaiMoney(s.b31to60)}</span> : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.b61to90 > 0 ? <span className="text-orange-700 font-medium">{formatThaiMoney(s.b61to90)}</span> : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {s.b90plus > 0 ? <span className="text-red-700 font-bold">{formatThaiMoney(s.b90plus)}</span> : '—'}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">{formatThaiMoney(s.total)}</td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => router.push(`/suppliers/${s.id}/payables`)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                          >
                            ดูบัญชี <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-slate-50">
                      <td className="px-4 py-2.5 text-xs font-semibold text-gray-500">รวม</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{formatThaiMoney(data.totals.b0to30)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-yellow-700">{formatThaiMoney(data.totals.b31to60)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-orange-700">{formatThaiMoney(data.totals.b61to90)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums text-red-700">{formatThaiMoney(data.totals.b90plus)}</td>
                      <td className="px-4 py-2.5 text-right font-bold tabular-nums">{formatThaiMoney(data.totals.total)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Mobile */}
              <div className="md:hidden divide-y">
                {data.suppliers.map((s) => (
                  <div
                    key={s.id}
                    className={cn('p-4 space-y-2 cursor-pointer active:bg-slate-50', severityColor(s))}
                    onClick={() => router.push(`/suppliers/${s.id}/payables`)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <p className="font-bold text-gray-900">{formatThaiMoney(s.total)}</p>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-xs">
                      {[
                        { label: '0–30', value: s.b0to30, cls: '' },
                        { label: '31–60', value: s.b31to60, cls: s.b31to60 > 0 ? 'text-yellow-700' : '' },
                        { label: '61–90', value: s.b61to90, cls: s.b61to90 > 0 ? 'text-orange-700' : '' },
                        { label: '90+',  value: s.b90plus, cls: s.b90plus  > 0 ? 'text-red-700 font-bold' : '' },
                      ].map(({ label, value, cls }) => (
                        <div key={label} className="text-center">
                          <p className="text-slate-400">{label}</p>
                          <p className={cn('font-medium', cls)}>{value > 0 ? formatThaiMoney(value) : '—'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
