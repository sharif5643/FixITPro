'use client'

import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, XCircle } from 'lucide-react'
import api from '@/lib/api'

interface SubscriptionData {
  effectiveStatus: string
  daysRemaining: number
  expiryDate: string
}

export function SubscriptionBanner() {
  const { data } = useQuery<SubscriptionData>({
    queryKey: ['subscription'],
    queryFn: async () => (await api.get('/subscription')).data,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  if (!data) return null

  const { effectiveStatus, daysRemaining } = data

  if (effectiveStatus === 'EXPIRED') {
    return (
      <div className="flex items-center justify-between gap-2 bg-red-600 px-3 sm:px-5 py-2 text-white text-xs sm:text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <XCircle className="h-4 w-4 shrink-0" />
          <span className="font-medium truncate">แพ็กเกจหมดอายุแล้ว — ระบบถูกจำกัดการใช้งาน</span>
        </div>
        <Link
          href="/subscription"
          className="shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-2 sm:px-3 py-1 text-xs font-semibold transition-colors"
        >
          ดูรายละเอียด
        </Link>
      </div>
    )
  }

  if (daysRemaining <= 7 && daysRemaining > 0) {
    return (
      <div className="flex items-center justify-between gap-2 bg-amber-500 px-3 sm:px-5 py-2 text-white text-xs sm:text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-medium truncate">แพ็กเกจจะหมดอายุในอีก {daysRemaining} วัน</span>
        </div>
        <Link
          href="/subscription"
          className="shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-2 sm:px-3 py-1 text-xs font-semibold transition-colors"
        >
          ต่ออายุ
        </Link>
      </div>
    )
  }

  return null
}
