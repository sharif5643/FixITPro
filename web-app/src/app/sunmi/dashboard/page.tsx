'use client'

import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { ChevronRight, RefreshCw, Receipt } from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface OwnerDashboard {
  today: {
    salesRevenue: number
    repairRevenue: number
    packageSaleRevenue: number
    totalRevenue: number
    salesCount: number
    repairPaymentsCount: number
    voidedCount: number
    voidedAmount: number
    cashIn: number
    transferIn: number
  }
  repairOps: {
    inProgress: number
    completedNotDelivered: number
    waitingApproval: number
    waitingParts: number
    overdue: number
    totalActive: number
  }
  stock: { outOfStock: number; lowStock: number }
  currentShift: {
    isOpen: boolean
    openedAt: string | null
    userName: string | null
    openBalance: number
  }
  alerts: {
    unpaidRepairs: number
    pendingClaims: number
    lowStock: number
    outOfStock: number
  }
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, accent = 'slate',
}: {
  label: string
  value: string
  sub?: string
  accent?: 'slate' | 'green' | 'blue' | 'amber' | 'red' | 'purple'
}) {
  const colors = {
    slate:  'bg-white border-slate-100',
    green:  'bg-green-50 border-green-100',
    blue:   'bg-blue-50 border-blue-100',
    amber:  'bg-amber-50 border-amber-100',
    red:    'bg-red-50 border-red-100',
    purple: 'bg-purple-50 border-purple-100',
  }
  const textColors = {
    slate:  'text-slate-900',
    green:  'text-green-700',
    blue:   'text-blue-700',
    amber:  'text-amber-700',
    red:    'text-red-700',
    purple: 'text-purple-700',
  }
  return (
    <div className={`rounded-2xl border p-3.5 ${colors[accent]}`}>
      <p className="text-xs text-slate-500 font-medium mb-1 leading-tight">{label}</p>
      <p className={`text-xl font-bold tabular-nums leading-tight ${textColors[accent]}`}>{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5 leading-tight">{sub}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SunmiDashboardPage() {
  const router = useRouter()

  const { data: dash, isLoading: dashLoading, refetch: refetchDash, isRefetching } = useQuery<OwnerDashboard>({
    queryKey: ['owner-dashboard'],
    queryFn: async () => (await api.get('/reports/owner-dashboard')).data,
    staleTime: 60_000,
  })

  return (
    <SunmiShell
      title="แดชบอร์ด"
      showBack
      rightContent={
        <button
          onClick={() => refetchDash()}
          disabled={isRefetching}
          className="h-10 w-10 flex items-center justify-center text-slate-300 active:text-white"
        >
          <RefreshCw className={`h-5 w-5 ${isRefetching ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      <div className="p-3 space-y-4 pb-8">

        {/* ── Stats section ─────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
            สรุปวันนี้
          </p>
          {dashLoading ? (
            <div className="grid grid-cols-2 gap-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-slate-100" />
              ))}
            </div>
          ) : dash ? (
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="รายได้รวมวันนี้"
                value={formatThaiMoney(dash.today.totalRevenue)}
                sub={`${dash.today.salesCount} บิล POS · ${dash.today.repairPaymentsCount} งานซ่อม`}
                accent="green"
              />
              <StatCard
                label="ยอดขาย POS"
                value={formatThaiMoney(dash.today.salesRevenue)}
                accent="blue"
              />
              <StatCard
                label="รายได้งานซ่อม"
                value={formatThaiMoney(dash.today.repairRevenue)}
                accent="purple"
              />
              <StatCard
                label="ยอด SIM / Package"
                value={formatThaiMoney(dash.today.packageSaleRevenue)}
                accent="slate"
              />
              <StatCard
                label="งานซ่อมค้างอยู่"
                value={`${dash.repairOps.inProgress} งาน`}
                sub={dash.repairOps.completedNotDelivered > 0 ? `รอรับ ${dash.repairOps.completedNotDelivered} งาน` : undefined}
                accent={dash.repairOps.completedNotDelivered > 0 ? 'amber' : 'slate'}
              />
              <StatCard
                label="สต็อกใกล้หมด"
                value={`${dash.stock.lowStock} รายการ`}
                sub={dash.stock.outOfStock > 0 ? `หมดแล้ว ${dash.stock.outOfStock} รายการ` : undefined}
                accent={dash.stock.outOfStock > 0 ? 'red' : dash.stock.lowStock > 0 ? 'amber' : 'slate'}
              />
            </div>
          ) : null}

          {/* Shift & void row */}
          {dash && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5">
                <p className="text-xs text-slate-500 font-medium mb-1">กะปัจจุบัน</p>
                {dash.currentShift.isOpen ? (
                  <>
                    <p className="text-sm font-bold text-green-700">เปิดอยู่</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {dash.currentShift.userName}
                      {dash.currentShift.openedAt &&
                        ` · ${format(new Date(dash.currentShift.openedAt), 'HH:mm', { locale: th })}`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-bold text-amber-600">ยังไม่ได้เปิด</p>
                )}
              </div>
              <div className="bg-white border border-slate-100 rounded-2xl p-3.5">
                <p className="text-xs text-slate-500 font-medium mb-1">บิลยกเลิกวันนี้</p>
                <p className={`text-xl font-bold tabular-nums ${dash.today.voidedCount > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                  {dash.today.voidedCount} บิล
                </p>
                {dash.today.voidedAmount > 0 && (
                  <p className="text-xs text-red-400 mt-0.5">{formatThaiMoney(dash.today.voidedAmount)}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Shortcuts ─────────────────────────────────────────────────── */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-1">
            ทางลัด
          </p>
          <button
            onClick={() => router.push('/sunmi/sales/history')}
            className="w-full bg-white border border-slate-100 rounded-2xl px-4 py-3.5 flex items-center justify-between shadow-sm active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Receipt className="h-5 w-5 text-blue-600" />
              </div>
              <p className="font-semibold text-slate-800 text-sm">ค้นหาบิล</p>
            </div>
            <ChevronRight className="h-5 w-5 text-slate-300" />
          </button>
        </div>

      </div>
    </SunmiShell>
  )
}
