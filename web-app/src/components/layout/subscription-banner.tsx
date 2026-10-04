'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Lock, XCircle } from 'lucide-react'
import api from '@/lib/api'
import { TENANT_BLOCKED_EVENT } from '@/lib/tenant-expiry'

interface SubscriptionData {
  effectiveStatus: string
  daysRemaining: number
  graceDaysRemaining: number
  expiryDate: string
}

function Bar({ tone, icon: Icon, text, href, action }: {
  tone: 'red' | 'amber'; icon: typeof XCircle; text: string; href: string; action: string
}) {
  return (
    <div className={`flex items-center justify-between gap-2 px-3 sm:px-5 py-2 text-white text-xs sm:text-sm ${tone === 'red' ? 'bg-red-600' : 'bg-amber-500'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="font-medium">{text}</span>
      </div>
      <Link
        href={href}
        className="shrink-0 rounded-md bg-white/20 hover:bg-white/30 px-2 sm:px-3 py-1 text-xs font-semibold transition-colors"
      >
        {action}
      </Link>
    </div>
  )
}

/**
 * The shop's package state, from the server (not the copy cached at login), shown on every
 * page of the owner portal, the staff app and the Sunmi app. Refreshes at once when a save is
 * refused because the shop is expired or suspended.
 */
export function SubscriptionBanner() {
  const { data, refetch } = useQuery<SubscriptionData>({
    queryKey: ['subscription'],
    queryFn: async () => (await api.get('/subscription')).data,
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000,
  })

  useEffect(() => {
    const onBlocked = () => { refetch() }
    window.addEventListener(TENANT_BLOCKED_EVENT, onBlocked)
    return () => window.removeEventListener(TENANT_BLOCKED_EVENT, onBlocked)
  }, [refetch])

  if (!data) return null

  const { effectiveStatus, daysRemaining, graceDaysRemaining } = data

  if (effectiveStatus === 'SUSPENDED') {
    return <Bar tone="red" icon={Lock} href="/contact" action="ติดต่อเรา"
      text="ร้านถูกระงับการใช้งานชั่วคราว — ดูข้อมูลได้อย่างเดียว บันทึกไม่ได้ กรุณาติดต่อผู้ดูแลระบบ" />
  }

  if (effectiveStatus === 'EXPIRED') {
    return <Bar tone="red" icon={Lock} href="/billing" action="ต่ออายุ"
      text="แพ็กเกจหมดอายุแล้ว — ดูข้อมูลได้อย่างเดียว บันทึกไม่ได้ กรุณาต่ออายุ" />
  }

  if (effectiveStatus === 'GRACE') {
    return <Bar tone="red" icon={XCircle} href="/billing" action="ต่ออายุ"
      text={`แพ็กเกจหมดอายุแล้ว ยังใช้งานได้อีก ${graceDaysRemaining} วัน หลังจากนั้นจะบันทึกข้อมูลไม่ได้ กรุณาต่ออายุ`} />
  }

  if (daysRemaining <= 7 && daysRemaining > 0) {
    return <Bar tone="amber" icon={AlertTriangle} href="/billing" action="ต่ออายุ"
      text={`แพ็กเกจจะหมดอายุในอีก ${daysRemaining} วัน`} />
  }

  return null
}
