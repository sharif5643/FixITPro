'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth.store'
import { initPush } from '@/lib/push'

/** Turns on lock-screen notifications in the Android app once someone is signed in. */
export function PushSetup({ repairHref }: { repairHref: (repairId: string) => string }) {
  const router = useRouter()
  const userId = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!userId) return
    initPush((data) => {
      if (data.entityType === 'Repair' && data.entityId) router.push(repairHref(data.entityId))
    })
  }, [userId, router, repairHref])

  return null
}
