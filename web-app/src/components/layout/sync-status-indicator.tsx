'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Loader2, AlertCircle, WifiOff } from 'lucide-react'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { offlineQueue } from '@/lib/offline-queue'

export function SyncStatusIndicator() {
  const { online }                      = useNetworkStatus()
  const [pending, setPending]           = useState(0)
  const [failed,  setFailed]            = useState(0)

  useEffect(() => {
    async function refresh() {
      const all = await offlineQueue.getAll()
      setPending(all.filter((i) => i.status === 'PENDING').length)
      setFailed(all.filter((i) => i.status === 'FAILED').length)
    }

    refresh()
    const id = setInterval(refresh, 2500)
    return () => clearInterval(id)
  }, [online])

  if (!online) {
    return (
      <span title="ออฟไลน์" className="flex items-center text-amber-500 dark:text-amber-400">
        <WifiOff className="h-4 w-4" />
      </span>
    )
  }

  if (failed > 0) {
    return (
      <span title={`ซิงค์ล้มเหลว ${failed} รายการ`} className="flex items-center gap-1 text-red-500 text-xs">
        <AlertCircle className="h-4 w-4" />
        {failed}
      </span>
    )
  }

  if (pending > 0) {
    return (
      <span title={`รอซิงค์ ${pending} รายการ`} className="flex items-center gap-1 text-amber-500 dark:text-amber-400 text-xs">
        <Loader2 className="h-4 w-4 animate-spin" />
        {pending}
      </span>
    )
  }

  // All clear — show nothing (no visual clutter when idle)
  return (
    <span title="ซิงค์แล้ว" className="flex items-center text-green-500 opacity-0 group-hover:opacity-100 transition-opacity">
      <CheckCircle2 className="h-3.5 w-3.5" />
    </span>
  )
}
