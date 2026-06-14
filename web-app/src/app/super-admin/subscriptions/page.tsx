'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  CreditCard, Search, AlertTriangle, CheckCircle2,
  XCircle, Clock, Loader2, ArrowUpRight, Calendar,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { th } from 'date-fns/locale'
import { Input } from '@/components/ui/input'
import { TenantStatusBadge, PlanBadge } from '@/components/super-admin/status-badge'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { SuperAdminEmptyState } from '@/components/super-admin/empty-state'
import api from '@/lib/api'
import type { Tenant, TenantStatus } from '@/types'
import { cn } from '@/lib/utils'

type TabFilter = 'all' | 'active' | 'expiring' | 'expired' | 'suspended'

function daysLeft(d?: string | null) {
  if (!d) return null
  return differenceInDays(new Date(d), new Date())
}

function ExpiryCell({ tenant }: { tenant: Tenant }) {
  if (!tenant.expiryDate) return <span className="text-slate-600 text-xs">—</span>
  const days = daysLeft(tenant.expiryDate)
  const dateStr = format(new Date(tenant.expiryDate), 'd MMM yyyy', { locale: th })
  if (days === null) return null
  if (days < 0) return (
    <div>
      <span className="text-red-400 text-xs font-medium">หมดอายุแล้ว</span>
      <p className="text-slate-500 text-xs">{dateStr}</p>
    </div>
  )
  if (days <= 7) return (
    <div>
      <span className="text-amber-400 text-xs font-semibold">เหลือ {days} วัน</span>
      <p className="text-slate-500 text-xs">{dateStr}</p>
    </div>
  )
  return (
    <div>
      <span className="text-slate-300 text-xs">{dateStr}</span>
      <p className="text-slate-500 text-xs">เหลือ {days} วัน</p>
    </div>
  )
}

const TABS: { value: TabFilter; label: string; icon: React.ElementType; iconCls: string }[] = [
  { value: 'all',      label: 'ทั้งหมด',      icon: CreditCard,   iconCls: 'text-slate-400' },
  { value: 'active',   label: 'ใช้งานอยู่',   icon: CheckCircle2, iconCls: 'text-emerald-400' },
  { value: 'expiring', label: 'ใกล้หมดอายุ',  icon: AlertTriangle, iconCls: 'text-amber-400' },
  { value: 'expired',  label: 'หมดอายุ',      icon: XCircle,       iconCls: 'text-red-400' },
  { value: 'suspended',label: 'ถูกระงับ',     icon: Clock,         iconCls: 'text-orange-400' },
]

export default function SubscriptionsPage() {
  const [tabFilter, setTabFilter] = useState<TabFilter>('all')
  const [search, setSearch]       = useState('')

  const { data: tenantsData, isLoading } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ['sa-tenants', 'all'],
    queryFn:  () => api.get('/super-admin/tenants').then((r) => r.data),
    refetchInterval: 30_000,
  })

  const allTenants = tenantsData?.data ?? []

  const stats = useMemo(() => ({
    total:     allTenants.length,
    active:    allTenants.filter(t => t.status === 'ACTIVE').length,
    expiring:  allTenants.filter(t => {
      if (t.status !== 'ACTIVE' || !t.expiryDate) return false
      const d = daysLeft(t.expiryDate)
      return d !== null && d >= 0 && d <= 7
    }).length,
    expired:   allTenants.filter(t => t.status === 'EXPIRED').length,
    suspended: allTenants.filter(t => t.status === 'SUSPENDED').length,
  }), [allTenants])

  const filtered = useMemo(() => {
    let list = allTenants

    if (tabFilter === 'active')   list = list.filter(t => t.status === 'ACTIVE')
    if (tabFilter === 'expired')  list = list.filter(t => t.status === 'EXPIRED')
    if (tabFilter === 'suspended')list = list.filter(t => t.status === 'SUSPENDED')
    if (tabFilter === 'expiring') list = list.filter(t => {
      if (t.status !== 'ACTIVE' || !t.expiryDate) return false
      const d = daysLeft(t.expiryDate)
      return d !== null && d >= 0 && d <= 7
    })

    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(t =>
        t.shopName.toLowerCase().includes(q) ||
        t.ownerName.toLowerCase().includes(q) ||
        t.email.toLowerCase().includes(q),
      )
    }

    return [...list].sort((a, b) => {
      if (!a.expiryDate) return 1
      if (!b.expiryDate) return -1
      return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime()
    })
  }, [allTenants, tabFilter, search])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Subscriptions</h1>
          <p className="text-slate-400 text-sm mt-0.5">ภาพรวมสถานะ Subscription ของทุกร้านค้า</p>
        </div>
        <Link href="/super-admin/payments">
          <button className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-xl px-4 py-2.5 text-sm font-medium transition-colors">
            <CreditCard className="h-4 w-4" />
            ตรวจสอบการชำระเงิน
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <SuperAdminStatCard label="ทั้งหมด"      value={stats.total}     icon={CreditCard}   accent="slate" />
        <SuperAdminStatCard label="ใช้งานอยู่"   value={stats.active}    icon={CheckCircle2} accent="emerald" />
        <SuperAdminStatCard label="ใกล้หมดอายุ"  value={stats.expiring}  icon={AlertTriangle} accent="amber" />
        <SuperAdminStatCard label="หมดอายุ"      value={stats.expired}   icon={XCircle}       accent="red" />
        <SuperAdminStatCard label="ถูกระงับ"     value={stats.suspended} icon={Clock}         accent="violet" />
      </div>

      {/* Expiring soon alert */}
      {stats.expiring > 0 && (
        <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-xl px-5 py-3.5">
          <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm flex-1">
            มี <span className="font-bold">{stats.expiring}</span> ร้านค้าที่ subscription ใกล้หมดอายุ (≤7 วัน)
          </p>
          <button onClick={() => setTabFilter('expiring')}
            className="text-amber-400 hover:text-amber-300 text-sm font-medium flex items-center gap-1">
            ดูรายการ <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Filters + search */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 flex-wrap">
          {TABS.map(({ value, label, icon: Icon, iconCls }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTabFilter(value)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                tabFilter === value
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-300',
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', tabFilter === value ? iconCls : 'text-slate-500')} />
              {label}
              <span className={cn(
                'px-1.5 py-0.5 rounded-full text-[10px] font-bold',
                tabFilter === value ? 'bg-white/15' : 'bg-slate-800 text-slate-500',
              )}>
                {value === 'all'      ? stats.total :
                 value === 'active'   ? stats.active :
                 value === 'expiring' ? stats.expiring :
                 value === 'expired'  ? stats.expired :
                 stats.suspended}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-60">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาร้านค้า..."
            className="pl-9 bg-slate-900 border-slate-800 text-white placeholder:text-slate-600 text-sm rounded-xl"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-slate-500" />
          </div>
        ) : filtered.length === 0 ? (
          <SuperAdminEmptyState icon={CreditCard} title="ไม่พบข้อมูล" description="ลองเปลี่ยนตัวกรอง" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">ร้านค้า</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">แพ็กเกจ</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">สถานะ</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">วันหมดอายุ</th>
                <th className="text-left py-3.5 px-5 text-slate-400 font-medium text-xs uppercase tracking-wide">สมัครเมื่อ</th>
                <th className="py-3.5 px-5" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const days = daysLeft(t.expiryDate)
                const isExpiringSoon = t.status === 'ACTIVE' && days !== null && days >= 0 && days <= 7
                return (
                  <tr key={t.id}
                    className={cn(
                      'border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors',
                      isExpiringSoon && 'bg-amber-950/10',
                    )}>
                    <td className="py-3.5 px-5">
                      <p className="text-white font-medium">{t.shopName}</p>
                      <p className="text-slate-500 text-xs">{t.ownerName} · {t.email}</p>
                    </td>
                    <td className="py-3.5 px-5">
                      <PlanBadge plan={t.plan} />
                    </td>
                    <td className="py-3.5 px-5">
                      <TenantStatusBadge status={t.status} />
                    </td>
                    <td className="py-3.5 px-5">
                      <ExpiryCell tenant={t} />
                    </td>
                    <td className="py-3.5 px-5">
                      <span className="text-slate-500 text-xs flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(t.createdAt), 'd MMM yyyy', { locale: th })}
                      </span>
                    </td>
                    <td className="py-3.5 px-5">
                      <Link href={`/super-admin/tenants/${t.id}`}
                        className="text-violet-400 hover:text-violet-300 text-xs font-medium flex items-center gap-1">
                        ดูรายละเอียด <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
