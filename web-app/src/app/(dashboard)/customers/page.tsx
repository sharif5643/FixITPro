'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import {
  Plus, Search, Users, Loader2, X,
  Pencil, ChevronRight, Crown, Star, Sparkles,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { formatThaiMoney } from '@/lib/utils'
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
  VIP:     { label: 'VIP',    Icon: Crown,    cls: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  REGULAR: { label: 'ประจำ', Icon: Star,     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  NEW:     { label: 'ใหม่',  Icon: Sparkles, cls: 'bg-gray-50 text-gray-500 border-gray-200' },
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

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['customers'] })

  const EmptyState = ({ inSearch }: { inSearch: boolean }) => (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
      <Users className="h-10 w-10 text-gray-200" />
      <p className="text-sm font-medium">
        {inSearch ? 'ไม่พบลูกค้าที่ค้นหา' : 'ยังไม่มีข้อมูลลูกค้า'}
      </p>
      {!inSearch && (
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="mt-1 gap-1">
          <Plus className="h-3.5 w-3.5" /> เพิ่มลูกค้าแรก
        </Button>
      )}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">ลูกค้า</h1>
          <p className="text-sm text-muted-foreground mt-0.5">ทั้งหมด {customers.length} ราย</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">เพิ่มลูกค้า</span>
          <span className="sm:hidden">เพิ่ม</span>
        </Button>
      </div>

      {/* Search */}
      <div className="relative w-full sm:max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="ค้นหาชื่อ, เบอร์โทร, อีเมล..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* ── Desktop table (md+) ── */}
      <div className="hidden md:block bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState inSearch={!!search} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">ลูกค้า</th>
                  <th className="text-left px-4 py-3 font-medium">เบอร์ / อีเมล</th>
                  <th className="text-center px-4 py-3 font-medium">ซื้อแล้ว</th>
                  <th className="text-center px-4 py-3 font-medium">ซ่อมแล้ว</th>
                  <th className="text-right px-4 py-3 font-medium">ยอดรวม</th>
                  <th className="text-center px-4 py-3 font-medium">สถานะ</th>
                  <th className="text-center px-4 py-3 font-medium">คะแนน</th>
                  <th className="text-left px-4 py-3 font-medium">วันสมัคร</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const totalSpending = c.sales.reduce((sum, s) => sum + Number(s.total), 0)
                  const salesCount = c._count.sales
                  const repairsCount = c._count.repairs
                  return (
                    <tr
                      key={c.id}
                      className="border-b last:border-0 hover:bg-blue-50/40 transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{c.phone ?? '—'}</p>
                        {c.email && <p className="text-xs text-muted-foreground">{c.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold">{salesCount}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">ครั้ง</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold">{repairsCount}</span>
                        <span className="text-xs text-muted-foreground ml-0.5">งาน</span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                        {formatThaiMoney(totalSpending)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <TierBadge salesCount={salesCount} totalSpending={totalSpending} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {c.points}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {format(new Date(c.createdAt), 'dd MMM yyyy', { locale: th })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-gray-900"
                            onClick={(e) => { e.stopPropagation(); setEditCustomer(c) }}
                            title="แก้ไข"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-gray-900"
                            onClick={() => router.push(`/customers/${c.id}`)}
                            title="ดูโปรไฟล์"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Mobile cards (< md) ── */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground bg-white rounded-xl border">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border">
            <EmptyState inSearch={!!search} />
          </div>
        ) : (
          filtered.map((c) => {
            const totalSpending = c.sales.reduce((sum, s) => sum + Number(s.total), 0)
            const salesCount = c._count.sales
            const repairsCount = c._count.repairs
            return (
              <div key={c.id} className="bg-white rounded-xl border p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                    <p className="text-sm text-muted-foreground">{c.phone ?? c.email ?? '—'}</p>
                  </div>
                  <TierBadge salesCount={salesCount} totalSpending={totalSpending} />
                </div>

                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="rounded-lg bg-gray-50 py-2">
                    <p className="text-[10px] text-muted-foreground">ซื้อ</p>
                    <p className="font-bold text-sm">{salesCount}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-2">
                    <p className="text-[10px] text-muted-foreground">ซ่อม</p>
                    <p className="font-bold text-sm">{repairsCount}</p>
                  </div>
                  <div className="rounded-lg bg-blue-50 py-2 col-span-2">
                    <p className="text-[10px] text-blue-600">ยอดรวม</p>
                    <p className="font-bold text-sm text-blue-700 tabular-nums">
                      {formatThaiMoney(totalSpending)}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => setEditCustomer(c)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    แก้ไข
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs gap-1"
                    onClick={() => router.push(`/customers/${c.id}`)}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                    โปรไฟล์
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
        onSuccess={() => {
          setEditCustomer(null)
          invalidate()
        }}
      />
    </div>
  )
}
