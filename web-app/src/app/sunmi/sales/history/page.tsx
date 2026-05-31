'use client'

import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ChevronRight, RefreshCw, Receipt,
} from 'lucide-react'
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { formatThaiMoney } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import type { Sale, PaymentMethod } from '@/types'
import {
  PM_LABEL, PM_ICON,
  VoidConfirmSheet, RefundSheet, SaleDetailSheet,
} from '@/components/sunmi/sale-sheets'

function todayDateStr() {
  return format(new Date(), 'yyyy-MM-dd')
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SalesHistoryPage() {
  const { hasPermission } = useAuthStore()
  const qc = useQueryClient()

  const [selected,      setSelected]      = useState<Sale | null>(null)
  const [voidTarget,    setVoidTarget]    = useState<Sale | null>(null)
  const [refundTarget,  setRefundTarget]  = useState<Sale | null>(null)
  const [dateStr,       setDateStr]       = useState(todayDateStr)

  const canVoid = hasPermission('sales.refund')

  const { data: sales = [], isLoading, refetch, isRefetching } = useQuery<Sale[]>({
    queryKey: ['sales-history', dateStr],
    queryFn: async () => {
      const res = await api.get('/sales', { params: { date: dateStr } })
      return Array.isArray(res.data) ? res.data : res.data?.items ?? []
    },
  })

  const sorted = useMemo(
    () => [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sales],
  )

  const totalRevenue = useMemo(
    () => sorted.filter((s) => s.status !== 'VOIDED').reduce((sum, s) => sum + Number(s.total), 0),
    [sorted],
  )

  const voidedCount = useMemo(
    () => sorted.filter((s) => s.status === 'VOIDED').length,
    [sorted],
  )

  function handleVoidSuccess() {
    qc.invalidateQueries({ queryKey: ['sales-history', dateStr] })
    setSelected(null)
  }

  function handleRefundSuccess() {
    qc.invalidateQueries({ queryKey: ['sales-history', dateStr] })
    setSelected(null)
  }

  return (
    <>
      <SunmiShell
        title="ประวัติการขาย"
        showBack
        rightContent={
          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="h-10 w-10 flex items-center justify-center text-slate-300 active:text-white"
          >
            <RefreshCw className={`h-5 w-5 ${isRefetching ? 'animate-spin' : ''}`} />
          </button>
        }
        aboveScroll={
          <div className="bg-white border-b border-slate-100">
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-sm text-slate-500 shrink-0">วันที่</span>
              <input
                type="date"
                value={dateStr}
                max={todayDateStr()}
                onChange={(e) => setDateStr(e.target.value)}
                className="flex-1 h-10 px-3 border border-slate-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {sorted.length > 0 && (
              <div className="flex items-center justify-between px-4 pb-2.5">
                <p className="text-xs text-slate-400 font-medium">
                  {sorted.length} รายการ
                  {voidedCount > 0 && (
                    <span className="ml-1.5 text-red-400">· ยกเลิก {voidedCount}</span>
                  )}
                </p>
                <p className="text-sm font-bold text-slate-800 tabular-nums">
                  {formatThaiMoney(totalRevenue)}
                </p>
              </div>
            )}
          </div>
        }
      >
        <div className="p-3 space-y-2 pb-8">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
            ))
          ) : sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-52 text-slate-400">
              <Receipt className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-base font-medium">ไม่มีรายการขาย</p>
              <p className="text-sm mt-1 opacity-70">
                {dateStr === todayDateStr() ? 'วันนี้ยังไม่มีการขาย' : 'ไม่มีรายการในวันที่เลือก'}
              </p>
            </div>
          ) : (
            sorted.map((sale) => {
              const PMIcon  = PM_ICON[sale.paymentMethod as PaymentMethod] ?? PM_ICON.CASH
              const isVoided = sale.status === 'VOIDED'
              const isRefunded = sale.status === 'REFUNDED'
              const isPartial = sale.status === 'PARTIAL_REFUND'
              return (
                <button
                  key={sale.id}
                  onClick={() => setSelected(sale)}
                  className={`w-full bg-white rounded-2xl px-4 py-3 text-left shadow-sm active:scale-[0.98] transition-transform ${
                    isVoided ? 'opacity-40' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-bold text-blue-700">
                          {sale.receiptNumber}
                        </span>
                        {isVoided && (
                          <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">
                            ยกเลิก
                          </span>
                        )}
                        {isPartial && (
                          <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-full font-bold">
                            คืนบางส่วน
                          </span>
                        )}
                        {isRefunded && (
                          <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full font-bold">
                            คืนเงินแล้ว
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400">
                        {format(new Date(sale.createdAt), 'HH:mm', { locale: th })}
                        {' · '}
                        {sale.items.reduce((s, i) => s + i.quantity, 0)} ชิ้น
                        {sale.customer && ` · ${sale.customer.name}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PMIcon className="h-4 w-4 text-slate-400" />
                      <span className="font-bold text-slate-900 tabular-nums">
                        {formatThaiMoney(Number(sale.total))}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-300" />
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>
      </SunmiShell>

      {selected && (
        <SaleDetailSheet
          sale={selected}
          canVoid={canVoid}
          onClose={() => setSelected(null)}
          onVoidRequest={() => {
            setVoidTarget(selected)
            setSelected(null)
          }}
          onRefundRequest={() => {
            setRefundTarget(selected)
            setSelected(null)
          }}
        />
      )}

      {voidTarget && (
        <VoidConfirmSheet
          sale={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={handleVoidSuccess}
        />
      )}

      {refundTarget && (
        <RefundSheet
          sale={refundTarget}
          onClose={() => setRefundTarget(null)}
          onSuccess={handleRefundSuccess}
        />
      )}
    </>
  )
}
