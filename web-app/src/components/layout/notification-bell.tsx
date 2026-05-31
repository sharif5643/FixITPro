'use client'

import { useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { Bell, CheckCheck, ExternalLink, AlertTriangle, Info, AlertCircle, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import Link from 'next/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'
import { offlineQueue } from '@/lib/offline-queue'
import { useNetworkStatus } from '@/hooks/use-network-status'
import type { OperationalAlert } from '@/components/alerts/operational-alert-center'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  title: string
  message: string
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  entityType: string | null
  entityId: string | null
  isRead: boolean
  createdAt: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_ICON: Record<string, React.ElementType> = {
  INFO:     Info,
  WARNING:  AlertTriangle,
  ERROR:    AlertCircle,
  CRITICAL: Zap,
}

const SEV_COLOR: Record<string, string> = {
  INFO:     'text-blue-500',
  WARNING:  'text-amber-500',
  ERROR:    'text-red-500',
  CRITICAL: 'text-red-700',
}

const SEV_BG: Record<string, string> = {
  INFO:     'bg-blue-50',
  WARNING:  'bg-amber-50',
  ERROR:    'bg-red-50',
  CRITICAL: 'bg-red-100',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function NotificationBell() {
  const hasPerm     = useAuthStore((s) => s.hasPermission)
  const user        = useAuthStore((s) => s.user)
  const qc          = useQueryClient()
  const [open, setOpen] = useState(false)

  const enabled = hasPerm('notification.view')
  const { online } = useNetworkStatus()

  const { data: countData } = useQuery<{ count: number }>({
    queryKey:      ['notifications', 'unread-count'],
    queryFn:       async () => (await api.get('/notifications/unread-count')).data,
    refetchInterval: 60_000,
    enabled,
  })

  // Critical reminder count from operational alerts
  const { data: opAlerts = [] } = useQuery<OperationalAlert[]>({
    queryKey: ['operational-alerts', user?.branchId],
    queryFn:  async () => (await api.get('/alerts/operational')).data,
    refetchInterval: 60_000,
    enabled,
    staleTime: 30_000,
  })
  const criticalCount = opAlerts.filter(
    a => a.severity === 'CRITICAL' &&
         ['REPAIR_OVERDUE', 'TRANSFER_PENDING', 'TRANSFER_IN_TRANSIT'].includes(a.type)
  ).length

  const { data: listData } = useQuery<{ items: Notification[] }>({
    queryKey: ['notifications', 'recent'],
    queryFn:  async () => (await api.get('/notifications?limit=8&isRead=false')).data,
    enabled:  enabled && open,
    staleTime: 10_000,
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      if (!online) {
        await offlineQueue.enqueue('NOTIFICATION_READ', { id })
        return { _queued: true as const }
      }
      return api.patch(`/notifications/${id}/read`)
    },
    onSuccess: (res: any) => {
      if (!res?._queued) qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] })
    },
  })

  const unread = countData?.count ?? 0
  const items  = listData?.items ?? []

  if (!enabled) {
    return (
      <Button variant="ghost" size="icon" className="relative h-9 w-9" disabled>
        <Bell className="h-4 w-4 text-gray-400" />
      </Button>
    )
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className={`h-4 w-4 ${unread > 0 ? 'text-blue-600' : 'text-gray-500'}`} />
          {/* Unread notifications badge */}
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
          {/* Critical reminder badge (bottom-left of icon) */}
          {criticalCount > 0 && (
            <span className="absolute -bottom-0.5 -left-0.5 flex h-4 min-w-4 px-0.5 items-center justify-center rounded-full bg-amber-500 text-[9px] font-bold text-white">
              ⚠{criticalCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0" sideOffset={8}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-sm text-slate-900">การแจ้งเตือน</p>
            {unread > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                🔔 {unread}
              </span>
            )}
            {criticalCount > 0 && (
              <span className="inline-flex items-center justify-center h-5 min-w-5 px-1 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold">
                ⚠️ {criticalCount}
              </span>
            )}
          </div>
          {unread > 0 && (
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              อ่านทั้งหมด
            </button>
          )}
        </div>

        {/* List */}
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-8 text-center text-slate-400 text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              ไม่มีการแจ้งเตือนใหม่
            </div>
          ) : (
            items.map((n) => {
              const Icon = SEV_ICON[n.severity] ?? Info
              return (
                <button
                  key={n.id}
                  onClick={() => markRead.mutate(n.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0 ${SEV_BG[n.severity]}`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${SEV_COLOR[n.severity]}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800 truncate">{n.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: th })}
                    </p>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Footer */}
        <DropdownMenuSeparator />
        <div className="px-4 py-2">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium py-1"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            ดูการแจ้งเตือนทั้งหมด
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
