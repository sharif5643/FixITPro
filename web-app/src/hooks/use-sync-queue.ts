'use client'

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { offlineQueue, type QueueItem } from '@/lib/offline-queue'
import { useNetworkStatus } from './use-network-status'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

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
/**
 * What can be sent now: items done offline by the person signed in (or older items that did not
 * record anyone). Someone else's items wait for that person: sent under another sign-in, their
 * cash went into the wrong person's shift.
 */
export function splitByOwner(items: QueueItem[], userId: string | undefined) {
  const mine   = items.filter((i) => !i.userId || i.userId === userId)
  const others = items.filter((i) => i.userId && i.userId !== userId)
  return { mine, others }
}

export function useSyncQueue() {
  const { online } = useNetworkStatus()
  const qc        = useQueryClient()
  const syncing   = useRef(false)
  const userId    = useAuthStore((s) => s.user?.id)

  useEffect(() => {
    if (!online || !userId) return

    async function sync() {
      if (syncing.current) return
      syncing.current = true
      try {
        // Allow previously-failed items to be retried
        await offlineQueue.resetFailed()
        const { mine: pending, others } = splitByOwner(await offlineQueue.getPending(), userId)
        if (others.length > 0) {
          const names = Array.from(new Set(others.map((o) => o.userName || 'พนักงานคนก่อน')))
          toast.info(`มี ${others.length} รายการที่บันทึกตอนออฟไลน์ของ ${names.join(', ')} — จะส่งเมื่อคนนั้นเข้าสู่ระบบ`)
        }
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
  }, [online, userId])
}
