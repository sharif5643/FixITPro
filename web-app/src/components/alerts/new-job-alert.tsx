'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Wrench, X } from 'lucide-react'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { playTypedSound, triggerHaptic } from '@/lib/alert-sound'

/** Repair jobs that need this person: assigned to them, or new with no technician yet. */
const JOB_TYPES = ['REPAIR_ASSIGNED', 'REPAIR_NEW']
const POLL_MS = 20_000
const SEEN_KEY = 'fixitpro:job-alert-seen'
/** On opening the app, older unread jobs stay in the bell; only recent ones pop up. */
const POP_UP_WITHIN_MS = 2 * 60 * 60 * 1000

interface Notif {
  id: string; type: string; title: string; message: string
  entityId: string | null; userId: string | null; createdAt: string
}

function readSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') } catch { return [] }
}
function writeSeen(ids: string[]) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(ids.slice(-100))) } catch { /* private mode */ }
}

/**
 * While the app is open: a sound and a pop-up as soon as a repair job comes in for this person
 * (checked every 20 seconds and whenever the app comes back to the front). The same alerts
 * stay in the notification bell. Phones that are locked get them through LINE instead.
 */
export function NewJobAlert({ repairHref }: { repairHref: (repairId: string) => string }) {
  const router = useRouter()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [queue, setQueue] = useState<Notif[]>([])

  const enabled = !!user && user.role !== 'SUPER_ADMIN'
  const { data, refetch } = useQuery<Notif[]>({
    queryKey: ['new-job-alerts', user?.id],
    queryFn: async () => {
      const res = await api.get('/notifications', { params: { isRead: 'false', limit: 20 } })
      const items: Notif[] = res.data?.items ?? res.data?.data ?? []
      return items.filter((n) => JOB_TYPES.includes(n.type) && n.userId === user?.id)
    },
    enabled,
    refetchInterval: POLL_MS,
    staleTime: 5_000,
  })

  // Check at once when the app comes back to the front
  useEffect(() => {
    if (!enabled) return
    const onVisible = () => { if (document.visibilityState === 'visible') refetch() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [enabled, refetch])

  // New ones (not shown before, recent) join the queue with one sound
  useEffect(() => {
    if (!data?.length) return
    const seen = readSeen()
    const fresh = data.filter((n) => !seen.includes(n.id) && Date.now() - new Date(n.createdAt).getTime() < POP_UP_WITHIN_MS)
    if (!fresh.length) return
    writeSeen([...seen, ...fresh.map((n) => n.id)])
    setQueue((q) => [...q, ...fresh.filter((n) => !q.some((x) => x.id === n.id))])
    playTypedSound('URGENT_REPAIR', 'WARNING')
    triggerHaptic()
  }, [data])

  const current = queue[0]
  const more = queue.length - 1
  const dismiss = useCallback(async (open: boolean) => {
    if (!current) return
    setQueue((q) => q.slice(1))
    api.patch(`/notifications/${current.id}/read`).catch(() => {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
    if (open && current.entityId) router.push(repairHref(current.entityId))
  }, [current, qc, repairHref, router])

  if (!current) return null

  return (
    <div className="fixed inset-x-0 top-0 z-[70] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+12px)] pointer-events-none">
      <div className="pointer-events-auto w-full max-w-md rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden animate-in slide-in-from-top-4">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500">
            <Wrench className="h-6 w-6 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">{current.title}</p>
            <p className="text-sm text-slate-600 mt-0.5">{current.message}</p>
            {more > 0 && <p className="text-xs text-orange-600 mt-1">และอีก {more} งาน</p>}
          </div>
          <button onClick={() => dismiss(false)} className="text-slate-400 hover:text-slate-600" aria-label="ปิด">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 border-t border-slate-100">
          <button onClick={() => dismiss(false)} className="py-3 text-sm font-semibold text-slate-600 active:bg-slate-50">รับทราบ</button>
          <button onClick={() => dismiss(true)} className="py-3 text-sm font-bold text-white bg-orange-500 active:bg-orange-600">ดูงาน</button>
        </div>
      </div>
    </div>
  )
}
