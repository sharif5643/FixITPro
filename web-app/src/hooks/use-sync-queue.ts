'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { offlineQueue, type QueueItem } from '@/lib/offline-queue'
import { useNetworkStatus } from './use-network-status'
import api from '@/lib/api'

async function processItem(item: QueueItem, qc: ReturnType<typeof useQueryClient>): Promise<void> {
  switch (item.type) {
    case 'REPAIR_CREATE':
      await api.post('/repairs', item.payload)
      qc.invalidateQueries({ queryKey: ['repairs'] })
      break

    case 'EXPENSE_CREATE':
      await api.post('/expenses', item.payload)
      qc.invalidateQueries({ queryKey: ['expenses-summary-daily'] })
      qc.invalidateQueries({ queryKey: ['expenses-today-list'] })
      break

    case 'NOTIFICATION_READ': {
      const { id } = item.payload as { id: string }
      await api.patch(`/notifications/${id}/read`)
      qc.invalidateQueries({ queryKey: ['notifications'] })
      break
    }
  }
}

// Place this hook in the SUNMI layout to auto-sync on reconnect.
export function useSyncQueue() {
  const { online } = useNetworkStatus()
  const qc        = useQueryClient()
  const syncing   = useRef(false)

  useEffect(() => {
    if (!online) return

    async function sync() {
      if (syncing.current) return
      syncing.current = true
      try {
        // Allow previously-failed items to be retried
        await offlineQueue.resetFailed()
        const pending = await offlineQueue.getPending()
        if (pending.length === 0) return

        let synced = 0
        let failed = 0

        for (const item of pending) {
          try {
            await processItem(item, qc)
            await offlineQueue.markSynced(item.id)
            synced++
          } catch (err) {
            await offlineQueue.markFailed(item.id, (err as Error).message ?? 'unknown')
            failed++
          }
        }

        await offlineQueue.clearSynced()

        if (synced > 0) toast.success(`ซิงค์สำเร็จ ${synced} รายการ`)
        if (failed > 0) toast.error(`ซิงค์ล้มเหลว ${failed} รายการ — จะลองใหม่อีกครั้ง`)
      } finally {
        syncing.current = false
      }
    }

    sync()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online])
}
