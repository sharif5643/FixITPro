'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, Users, Pencil, ChevronRight, Crown, Star, Sparkles,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { FilterBar } from '@/components/ui/filter-bar'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { ModuleGate } from '@/components/auth/module-gate'
import api from '@/lib/api'
import type { Customer } from '@/types'

interface CustomerWithStats extends Customer {
  _count: { sales: number; repairs: number }
  sales: { total: string | number }[]
}

type Tier = 'VIP' | 'REGULAR' | 'NEW'

function getTier(salesCount: number, totalSpending: number): Tier {
  if (totalSpending >= 10000) return 'VIP'
  if (salesCount >= 3) return 'REGULAR'
  return 'NEW'
}

const TIER_CONFIG: Record<Tier, { label: string; Icon: React.ElementType; cls: string }> = {
  VIP:     { label: 'VIP',    Icon: Crown,    cls: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-800/60' },
  REGULAR: { label: 'ประจำ', Icon: Star,     cls: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/60' },
  NEW:     { label: 'ใหม่',  Icon: Sparkles, cls: 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' },
}

function TierBadge({ salesCount, totalSpending }: { salesCount: number; totalSpending: number }) {
  const tier = getTier(salesCount, totalSpending)
  const { label, Icon, cls } = TIER_CONFIG[tier]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

export default function CustomersPage() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const hasModule = useAuthStore((s) => s.hasModule)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null)

  const { data: customers = [], isLoading } = useQuery<CustomerWithStats[]>({
    queryKey: ['customers'],
    queryFn: async () => (await api.get('/customers')).data,
    placeholderData: keepPreviousData,
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return customers
    const q = search.toLowerCase()
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone?.toLowerCase().includes(q) ?? false) ||
        (c.email?.toLowerCase().includes(q) ?? false),
    )
  }, [customers, search])

  const crmStats = useMemo(() => {
    if (!customers.length) return null
    let vip = 0, regular = 0, totalSpend = 0
    for (const c of customers) {
      const spending = c.sales.reduce((sum, s) => sum + Number(s.total), 0)
      totalSpend += spending
      if (spending >= 10000) vip++
      else if (c._count.sales >= 3) regular++
    }
    return { total: customers.length, vip, regular, newCount: customers.length - vip - regular, totalSpend }
  }, [customers])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] })

  if (!hasModule('crm')) return <ModuleGate module="crm">{null}</ModuleGate>

  return (
    <div className="space-y-5">
      <PageHeader
        title="ลูกค้า"
        icon={Users}
        subtitle={isLoading ? '' : `${customers.length} ราย`}
        primaryAction={
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่มลูกค้า</span>
            <span className="sm:hidden">เพิ่ม</span>
          </Button>
        }
      />

      {/* ── CRM Stats Bar ── */}
      {crmStats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
            <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">ลูกค้าทั้งหมด</p>
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-50 mt-1 tabular-nums">{crmStats.total}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{formatThaiMoney(crmStats.totalSpend)} ยอดรวม</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl border border-yellow-200 dark:border-yellow-800/60 p-4">
            <p className="text-[11px] font-semibold text-yellow-600 dark:text-yellow-400 uppercase tracking-wide flex items-center gap-1">
              <Crown className="h-3 w-3" /> VIP
            </p>
            <p className="text-2xl font-bold text-yellow-800 dark:text-yellow-300 mt-1 tabular-nums">{crmStats.vip}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-0.5">ยอดซื้อ ≥ ฿10,000</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800/60 p-4">
            <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wide flex items-center gap-1">
              <Star className="h-3 w-3" /> ประจำ
            </p>
            <p className="text-2xl font-bold text-blue-800 dark:text-blue-300 mt-1 tabular-nums">{crmStats.regular}</p>
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">ซื้อ ≥ 3 ครั้ง</p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> ใหม่
            </p>
            <p className="text-2xl font-bold text-slate-700 dark:text-slate-200 mt-1 tabular-nums">{crmStats.newCount}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">ยังไม่มีประวัติซ้ำ</p>
          </div>
        </div>
      )}

      <FilterBar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="ค้นหาชื่อ, เบอร์โทร, อีเมล..."
      />

      {/* ── Desktop table (md+) ── */}
      <SectionCard noPadding className="hidden md:block">
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>ลูกค้า</DataTableHeadCell>
            <DataTableHeadCell>เบอร์ / อีเมล</DataTableHeadCell>
            <DataTableHeadCell className="text-center">ซื้อแล้ว</DataTableHeadCell>
            <DataTableHeadCell className="text-center" hidden>ซ่อมแล้ว</DataTableHeadCell>
            <DataTableHeadCell right>ยอดรวม</DataTableHeadCell>
            <DataTableHeadCell className="text-center">สถานะ</DataTableHeadCell>
            <DataTableHeadCell className="text-center" hidden>คะแนน</DataTableHeadCell>
            <DataTableHeadCell hidden>วันสมัคร</DataTableHeadCell>
            <DataTableHeadCell className="w-16" />
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={7} cols={9} />
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-0">
                  <EmptyState preset={search ? 'search' : 'customers'} size="md" />
                </td>
              </tr>
            ) : (
              filtered.map((c) => {
                const totalSpending = c.sales.reduce((sum, s) => sum + Number(s.total), 0)
                const salesCount   = c._count.sales
                const repairsCount = c._count.repairs
                return (
                  <DataTableRow key={c.id} onClick={() => router.push(`/customers/${c.id}`)}>
                    <DataTableCell>
                      <p className="font-semibold text-slate-900">{c.name}</p>
                    </DataTableCell>
                    <DataTableCell>
                      <p className="text-slate-700">{c.phone ?? '—'}</p>
                      {c.email && <p className="text-xs text-slate-400">{c.email}</p>}
                    </DataTableCell>
                    <DataTableCell className="text-center">
                      <span className="font-semibold">{salesCount}</span>
                      <span className="text-xs text-slate-400 ml-0.5">ครั้ง</span>
                    </DataTableCell>
                    <DataTableCell className="text-center" hidden>
                      <span className="font-semibold">{repairsCount}</span>
                      <span className="text-xs text-slate-400 ml-0.5">งาน</span>
                    </DataTableCell>
                    <DataTableCell right>
                      <span className="font-semibold tabular-nums text-slate-900">
                        {formatThaiMoney(totalSpending)}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-center">
                      <TierBadge salesCount={salesCount} totalSpending={totalSpending} />
                    </DataTableCell>
                    <DataTableCell className="text-center" hidden>
                      <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
                        {c.points}
                      </span>
                    </DataTableCell>
                    <DataTableCell hidden muted>
                      <span className="text-xs whitespace-nowrap">
                        {format(new Date(c.createdAt), 'dd MMM yyyy', { locale: th })}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-slate-900"
                          onClick={(e) => { e.stopPropagation(); setEditCustomer(c) }}
                          title="แก้ไข"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="icon" variant="ghost"
                          className="h-7 w-7 text-slate-400 hover:text-slate-900"
                          onClick={(e) => { e.stopPropagation(); router.push(`/customers/${c.id}`) }}
                          title="ดูโปรไฟล์"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                )
              })
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>

      {/* ── Mobile cards (< md) ── */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <SectionCard>
            <div className="h-40 flex items-center justify-center">
              <div className="h-5 w-5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
            </div>
          </SectionCard>
        ) : filtered.length === 0 ? (
          <SectionCard noPadding>
            <EmptyState preset={search ? 'search' : 'customers'} size="md" />
          </SectionCard>
        ) : (
          filtered.map((c) => {
            const totalSpending = c.sales.reduce((sum, s) => sum + Number(s.total), 0)
            const salesCount   = c._count.sales
            const repairsCount = c._count.repairs
            return (
              <div
                key={c.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-slate-50 truncate">{c.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{c.phone ?? c.email ?? '—'}</p>
                  </div>
                  <TierBadge salesCount={salesCount} totalSpending={totalSpending} />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">ซื้อ</p>
                    <p className="font-bold text-sm dark:text-slate-200">{salesCount}</p>
                  </div>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2">
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">ซ่อม</p>
                    <p className="font-bold text-sm dark:text-slate-200">{repairsCount}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-900/20 py-2 col-span-2">
                    <p className="text-[10px] text-blue-600 dark:text-blue-400">ยอดรวม</p>
                    <p className="font-bold text-sm text-blue-700 dark:text-blue-300 tabular-nums">
                      {formatThaiMoney(totalSpending)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline" size="sm"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => setEditCustomer(c)}
                  >
                    <Pencil className="h-3.5 w-3.5" />แก้ไข
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => router.push(`/customers/${c.id}`)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />โปรไฟล์
                  </Button>
                </div>
              </div>
            )
          })
        )}
      </div>

      <CustomerFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => { setCreateOpen(false); invalidate() }}
      />

      <CustomerFormDialog
        open={!!editCustomer}
        onOpenChange={(v) => { if (!v) setEditCustomer(null) }}
        initialData={editCustomer ?? undefined}
        onSuccess={() => { setEditCustomer(null); invalidate() }}
      />
    </div>
  )
}
