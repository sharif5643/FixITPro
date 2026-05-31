'use client'

import { useState, useEffect } from 'react'
import { WifiOff, RefreshCw } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { offlineQueue } from '@/lib/offline-queue'

export function OfflineBanner() {
  const { online }                    = useNetworkStatus()
  const [pendingCount, setPendingCount] = useState(0)

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>

    async function refresh() {
      setPendingCount(await offlineQueue.pendingCount())
    }

    refresh()
    timer = setInterval(refresh, 2500)
    return () => clearInterval(timer)
  }, [online])

  const visible = !online || pendingCount > 0
  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium select-none ${
        online ? 'bg-amber-500 text-white' : 'bg-orange-600 text-white'
      }`}
    >
      {online ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <WifiOff className="h-3.5 w-3.5 shrink-0" />
      )}
      <span>
        {online
          ? `รอซิงค์ ${pendingCount} รายการ…`
          : `ทำงานในโหมดออฟไลน์${pendingCount > 0 ? ` — รอซิงค์: ${pendingCount}` : ''}`}
      </span>
    </div>
  )
}
