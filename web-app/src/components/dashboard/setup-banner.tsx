'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Rocket } from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

const doneKey = (tenantId: string) => `fixitpro-setup-done-${tenantId}`

/**
 * For a shop that has just started (no product or no shift yet): where to begin. Once both exist
 * it never shows again on this device.
 */
export function SetupBanner() {
  const user = useAuthStore((s) => s.user)
  const tenantId = user?.tenantId ?? ''
  const [hidden, setHidden] = useState(true)
  useEffect(() => {
    try { setHidden(!tenantId || localStorage.getItem(doneKey(tenantId)) === '1') } catch { setHidden(false) }
  }, [tenantId])
  const enabled = !hidden && user?.role === 'OWNER'

  const { data } = useQuery({
    queryKey: ['setup-banner', tenantId],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [products, shifts] = await Promise.all([api.get('/products'), api.get('/shifts')])
      const count = (d: unknown) => (Array.isArray(d) ? d.length : ((d as { data?: unknown[] })?.data?.length ?? 0))
      return { products: count(products.data), shifts: count(shifts.data) }
    },
  })

  useEffect(() => {
    if (data && data.products > 0 && data.shifts > 0) {
      try { localStorage.setItem(doneKey(tenantId), '1') } catch { /* private window */ }
      setHidden(true)
    }
  }, [data, tenantId])

  if (!enabled || !data || (data.products > 0 && data.shifts > 0)) return null
  const next = data.products === 0 ? 'เพิ่มสินค้าแรก' : 'เปิดกะแรก'
  return (
    <Link
      href="/settings/setup"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-blue-900 hover:bg-blue-100 transition-colors dark:border-blue-800/60 dark:bg-blue-900/20 dark:text-blue-100"
    >
      <Rocket className="h-5 w-5 shrink-0 text-blue-600" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold">เริ่มต้นใช้งานร้าน</p>
        <p className="text-xs text-blue-700 dark:text-blue-300">ขั้นต่อไป: {next} — ดูขั้นตอนทั้งหมด</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0" />
    </Link>
  )
}
