'use client'

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Building2, Users, TrendingUp, AlertTriangle,
  ArrowUpRight, CheckCircle2, Clock, Package,
  Activity, Zap, GitBranch,
} from 'lucide-react'
import { format, differenceInDays } from 'date-fns'
import { th } from 'date-fns/locale'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { TenantStatusBadge, PlanBadge } from '@/components/super-admin/status-badge'
import api from '@/lib/api'
import type { Tenant, TenantPlan } from '@/types'
import { TENANT_PLAN_LABEL } from '@/types'
import { cn } from '@/lib/utils'

interface Stats {
  total: number
  active: number
  expiring: number
  expired: number
  suspended: number
  pending: number
}

interface PaymentStats {
  total: number
  pending: number
  verified: number
  activated: number
  rejected: number
}

function SystemHealthDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={cn('h-2 w-2 rounded-full shrink-0', ok ? 'bg-emerald-400' : 'bg-red-400')} />
      <span className="text-slate-300 text-sm">{label}</span>
      <span className={cn('ml-auto text-xs font-medium', ok ? 'text-emerald-400' : 'text-red-400')}>
        {ok ? 'Operational' : 'Issue'}
      </span>
    </div>
  )
}

export default function SuperAdminDashboard() {
  const { data: stats } = useQuery<Stats>({
    queryKey: ['sa-stats'],
    queryFn: () => api.get('/super-admin/tenants/stats').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data: tenantsData } = useQuery<{ data: Tenant[]; total: number }>({
    queryKey: ['sa-tenants', 'all'],
    queryFn: () => api.get('/super-admin/tenants').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const { data: paymentStats } = useQuery<PaymentStats>({
    queryKey: ['sa-payment-stats'],
    queryFn: () => api.get('/super-admin/payments/stats').then((r) => r.data),
    refetchInterval: 60_000,
  })

  const tenants = tenantsData?.data ?? []

  // Recent tenants (last 6, newest first)
  const recentTenants = useMemo(() =>
    [...tenants].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 6),
    [tenants],
  )

  // Expiring soon (≤7 days, ACTIVE)
  const expiringSoon = useMemo(() =>
    tenants.filter((t) => {
      if (t.status !== 'ACTIVE' || !t.expiryDate) return false
      const days = differenceInDays(new Date(t.expiryDate), new Date())
      return days >= 0 && days <= 7
    }).slice(0, 5),
    [tenants],
  )

  // Package distribution
  const planDist = useMemo(() => {
    const counts: Record<string, number> = { TRIAL: 0, BASIC: 0, PRO: 0, ENTERPRISE: 0 }
    tenants.filter(t => t.status === 'ACTIVE').forEach(t => { counts[t.plan] = (counts[t.plan] ?? 0) + 1 })
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([plan, count]) => ({
        plan: plan as TenantPlan,
        count,
        pct: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
  }, [tenants])

  const PLAN_BAR: Record<TenantPlan, string> = {
    TRIAL: 'bg-slate-500',
    BASIC: 'bg-blue-500',
    PRO: 'bg-violet-500',
    ENTERPRISE: 'bg-amber-500',
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
        <p className="text-slate-400 text-sm mt-0.5">
          {format(new Date(), "EEEE d MMMM yyyy", { locale: th })}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <SuperAdminStatCard
          label="Total Tenants"
          value={stats?.total ?? '—'}
          icon={Building2}
          accent="violet"
          sub="ร้านค้าทั้งหมด"
        />
        <SuperAdminStatCard
          label="Active"
          value={stats?.active ?? '—'}
          icon={CheckCircle2}
          accent="emerald"
          sub="ใช้งานอยู่"
        />
        <SuperAdminStatCard
          label="Branches"
          value="—"
          icon={GitBranch}
          accent="blue"
          sub="ไม่มี API ยัง"
        />
        <SuperAdminStatCard
          label="Users"
          value={tenants.reduce((s, t) => s + (t._count?.users ?? 0), 0)}
          icon={Users}
          accent="slate"
          sub="ผู้ใช้งานทั้งหมด"
        />
        <SuperAdminStatCard
          label="Expiring Soon"
          value={stats?.expiring ?? '—'}
          icon={AlertTriangle}
          accent="amber"
          sub="ภายใน 7 วัน"
        />
        <SuperAdminStatCard
          label="Pending Payment"
          value={paymentStats?.pending ?? '—'}
          icon={Clock}
          accent="red"
          sub="รอตรวจสอบ"
        />
      </div>

      {/* Alert bar */}
      {(paymentStats?.pending ?? 0) > 0 && (
        <div className="flex items-center gap-3 bg-amber-900/20 border border-amber-500/30 rounded-xl px-5 py-3.5">
          <Clock className="h-5 w-5 text-amber-400 shrink-0" />
          <p className="text-amber-300 text-sm flex-1">
            มี <span className="font-bold">{paymentStats!.pending}</span> รายการชำระเงินรอการตรวจสอบ
          </p>
          <Link href="/super-admin/payments"
            className="text-amber-400 hover:text-amber-300 text-sm font-medium flex items-center gap-1">
            ดูรายการ <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Recent tenants */}
        <div className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-violet-400" />
              <span className="text-white font-semibold text-sm">ร้านค้าล่าสุด</span>
            </div>
            <Link href="/super-admin/tenants"
              className="text-violet-400 hover:text-violet-300 text-xs font-medium flex items-center gap-1">
              ดูทั้งหมด <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
          {recentTenants.length === 0 ? (
            <div className="py-12 text-center text-slate-500">ยังไม่มีข้อมูล</div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {recentTenants.map((t) => (
                <Link key={t.id} href={`/super-admin/tenants/${t.id}`}>
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-slate-800/40 transition-colors cursor-pointer">
                    <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500/20 to-blue-500/20 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <span className="text-violet-300 font-bold text-sm">
                        {t.shopName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{t.shopName}</p>
                      <p className="text-slate-500 text-xs truncate">{t.ownerName} · {t.email}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PlanBadge plan={t.plan} />
                      <TenantStatusBadge status={t.status} />
                    </div>
                    <span className="text-slate-600 text-xs shrink-0 hidden sm:block">
                      {format(new Date(t.createdAt), 'd MMM', { locale: th })}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="space-y-5">
          {/* Package distribution */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-blue-400" />
              <span className="text-white font-semibold text-sm">Package Distribution</span>
            </div>
            {planDist.length === 0 ? (
              <p className="text-slate-500 text-sm text-center py-4">ยังไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-3">
                {planDist.map(({ plan, count, pct }) => (
                  <div key={plan}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 font-medium">{TENANT_PLAN_LABEL[plan]}</span>
                      <span className="text-slate-500">{count} ร้าน · {pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={cn('h-full rounded-full', PLAN_BAR[plan])}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* System health */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span className="text-white font-semibold text-sm">System Health</span>
            </div>
            <div className="space-y-3">
              <SystemHealthDot ok label="API Server" />
              <SystemHealthDot ok label="Database" />
              <SystemHealthDot ok label="Auth Service" />
              <SystemHealthDot ok label="File Storage" />
            </div>
          </div>

          {/* Expiring soon */}
          {expiringSoon.length > 0 && (
            <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <span className="text-white font-semibold text-sm">หมดอายุเร็วๆ นี้</span>
              </div>
              <div className="space-y-2.5">
                {expiringSoon.map((t) => {
                  const days = differenceInDays(new Date(t.expiryDate!), new Date())
                  return (
                    <Link key={t.id} href={`/super-admin/tenants/${t.id}`}>
                      <div className="flex items-center justify-between hover:bg-slate-800/40 rounded-lg px-2 py-1.5 -mx-2 transition-colors cursor-pointer">
                        <p className="text-slate-300 text-xs truncate flex-1">{t.shopName}</p>
                        <span className={cn(
                          'text-xs font-semibold shrink-0 ml-2',
                          days <= 3 ? 'text-red-400' : 'text-amber-400',
                        )}>
                          {days === 0 ? 'วันนี้' : `${days}วัน`}
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="h-4 w-4 text-violet-400" />
              <span className="text-white font-semibold text-sm">Quick Actions</span>
            </div>
            <div className="space-y-2">
              {[
                { label: 'เพิ่มร้านค้าใหม่',        href: '/super-admin/tenants' },
                { label: 'ตรวจสอบการชำระเงิน',    href: '/super-admin/payments' },
                { label: 'จัดการแพ็กเกจ',          href: '/super-admin/packages' },
                { label: 'จัดการโมดูล',             href: '/super-admin/modules' },
              ].map((a) => (
                <Link key={a.href} href={a.href}>
                  <div className="flex items-center gap-2 text-sm text-slate-400 hover:text-violet-300 hover:bg-slate-800/60 px-3 py-2 rounded-lg transition-colors cursor-pointer">
                    <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
                    {a.label}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
