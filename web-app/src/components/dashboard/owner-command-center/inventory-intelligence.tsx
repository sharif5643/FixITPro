'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { Package, AlertTriangle, XCircle, CheckCircle2, ChevronRight, RefreshCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { PCard, Skel, CardHeader } from './primitives'
import type { LowStockItem } from './types'

export function InventoryIntelligence() {
  const hasModule = useAuthStore(s => s.hasModule)
  const enabled   = hasModule('inventory')

  const { data, isLoading, isError, refetch } = useQuery<LowStockItem[]>({
    queryKey: ['stock', 'low-stock'],
    queryFn:  () => api.get('/stock/low-stock').then(r => r.data),
    enabled,
    staleTime: 5 * 60_000,
  })

  const outOfStock = (data ?? []).filter(i => i.severity === 'OUT_OF_STOCK')
  const lowStock   = (data ?? []).filter(i => i.severity === 'LOW_STOCK')
  const total      = (data ?? []).length
  const overLimit  = Math.max(0, outOfStock.length - 5) + Math.max(0, lowStock.length - 5)

  return (
    <PCard className="p-5" urgent={outOfStock.length > 0}>
      <CardHeader
        icon={Package}
        iconBg="bg-orange-50 dark:bg-orange-900/30"
        iconColor="text-orange-500"
        title="ข่าวกรองสต็อก"
      >
        {enabled && total > 0 && (
          <Link
            href="/stock"
            className="ml-auto text-[10px] text-blue-500 font-semibold hover:underline flex items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            ดูทั้งหมด <ChevronRight className="h-3 w-3" aria-hidden />
          </Link>
        )}
      </CardHeader>

      {!enabled ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Package className="h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden />
          <p className="text-xs text-slate-400 dark:text-slate-500">ไม่ได้เปิดใช้โมดูล Inventory</p>
        </div>

      ) : isLoading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skel key={i} className="h-9 w-full" />)}
        </div>

      ) : isError ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <AlertTriangle className="h-6 w-6 text-amber-400" aria-hidden />
          <p className="text-xs text-slate-400 dark:text-slate-500">โหลดข้อมูลไม่สำเร็จ</p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 text-[10px] text-blue-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
          >
            <RefreshCcw className="h-2.5 w-2.5" aria-hidden />ลองใหม่
          </button>
        </div>

      ) : total === 0 ? (
        <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700/60 rounded-xl px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" aria-hidden />
          <p className="text-xs text-emerald-700 dark:text-emerald-400 font-semibold">สต็อกทุกรายการอยู่ในเกณฑ์</p>
        </div>

      ) : (
        <div className="space-y-3">

          {/* Out of stock */}
          {outOfStock.length > 0 && (
            <section aria-label="สินค้าหมดสต็อก">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-red-500 mb-1.5">
                <XCircle className="h-3 w-3" aria-hidden />
                หมดสต็อก ({outOfStock.length})
              </p>
              <ul className="space-y-1">
                {outOfStock.slice(0, 5).map(item => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700/60 px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-red-700 dark:text-red-400 truncate">{item.name}</p>
                      <p className="text-[10px] text-red-400 dark:text-red-500">{item.sku}</p>
                    </div>
                    <span className="text-[10px] font-black text-red-600 dark:text-red-400 ml-2 flex-shrink-0">0</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Low stock */}
          {lowStock.length > 0 && (
            <section aria-label="สินค้าสต็อกต่ำ">
              <p className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-500 mb-1.5">
                <AlertTriangle className="h-3 w-3" aria-hidden />
                สต็อกต่ำ ({lowStock.length})
              </p>
              <ul className="space-y-1">
                {lowStock.slice(0, 5).map(item => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/60 px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 truncate">{item.name}</p>
                      <p className="text-[10px] text-amber-400 dark:text-amber-500">{item.sku}</p>
                    </div>
                    <span
                      className="text-[10px] font-bold text-amber-600 dark:text-amber-400 ml-2 flex-shrink-0 tabular-nums"
                      aria-label={`เหลือ ${item.stock} จาก ${item.minStock}`}
                    >
                      {item.stock}/{item.minStock}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overLimit > 0 && (
            <Link
              href="/stock"
              className="block text-center text-[10px] text-blue-500 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded py-1"
            >
              และอีก {overLimit} รายการ →
            </Link>
          )}
        </div>
      )}
    </PCard>
  )
}
