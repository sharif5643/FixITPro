'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Bell, CheckCheck, Info, AlertTriangle, AlertCircle, Zap } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { MobileBottomNav } from '@/components/sunmi/mobile-bottom-nav'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
  id: string
  type: string
  title: string
  message: string
  severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL'
  isRead: boolean
  createdAt: string
}

interface NotificationListResponse {
  items: Notification[]
  total: number
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SEV_ICON: Record<string, React.ElementType> = {
  INFO:     Info,
  WARNING:  AlertTriangle,
  ERROR:    AlertCircle,
  CRITICAL: Zap,
}

const SEV_COLOR: Record<string, string> = {
  INFO:     'text-blue-400',
  WARNING:  'text-amber-400',
  ERROR:    'text-red-400',
  CRITICAL: 'text-red-500',
}

const SEV_BG: Record<string, string> = {
  INFO:     'border-blue-800/40 bg-blue-950/30',
  WARNING:  'border-amber-800/40 bg-amber-950/30',
  ERROR:    'border-red-800/40 bg-red-950/30',
  CRITICAL: 'border-red-700/60 bg-red-950/50',
}

const SEV_BADGE: Record<string, string> = {
  INFO:     'bg-blue-900 text-blue-300',
  WARNING:  'bg-amber-900 text-amber-300',
  ERROR:    'bg-red-900 text-red-300',
  CRITICAL: 'bg-red-800 text-red-200',
}

const SEV_LABEL: Record<string, string> = {
  INFO:     'ข้อมูล',
  WARNING:  'เตือน',
  ERROR:    'ผิดพลาด',
  CRITICAL: 'วิกฤต',
}

const FILTER_TABS = [
  { value: 'all',      label: 'ทั้งหมด' },
  { value: 'unread',   label: 'ยังไม่อ่าน' },
  { value: 'CRITICAL', label: 'วิกฤต' },
  { value: 'ERROR',    label: 'ผิดพลาด' },
  { value: 'WARNING',  label: 'เตือน' },
  { value: 'INFO',     label: 'ข้อมูล' },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function SunmiNotificationsPage() {
  const router  = useRouter()
  const hasPerm = useAuthStore((s) => s.hasPermission)
  const qc      = useQueryClient()

  const [filter, setFilter] = useState('all')

  const params = new URLSearchParams({ page: '1', limit: '50' })
  if (filter === 'unread')   params.set('isRead', 'false')
  else if (['CRITICAL', 'ERROR', 'WARNING', 'INFO'].includes(filter)) params.set('severity', filter)

  const { data, isLoading } = useQuery<NotificationListResponse>({
    queryKey: ['notifications', 'sunmi-list', filter],
    queryFn:  async () => (await api.get(`/notifications?${params}`)).data,
    enabled:  hasPerm('notification.view'),
    staleTime: 15_000,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const items       = data?.items ?? []
  const total       = data?.total ?? 0
  const unreadCount = items.filter((n) => !n.isRead).length

  return (
    <div className="flex flex-col min-h-screen bg-slate-900 select-none">
      {/* Header */}
      <div className="shrink-0 px-4 pt-10 pb-4">
        <div className="flex items-center gap-3 mb-1">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 active:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-300" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-slate-400 text-xs font-semibold tracking-widest uppercase">FixITPro</p>
            <div className="flex items-center gap-2">
              <h1 className="text-white text-xl font-bold">การแจ้งเตือน</h1>
              {total > 0 && (
                <span className="text-slate-400 text-sm">({total})</span>
              )}
            </div>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 active:bg-blue-700 transition-colors"
            >
              <CheckCheck className="h-4 w-4 text-white" />
              <span className="text-white text-xs font-semibold">อ่านทั้งหมด</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs — horizontal scroll */}
      <div className="shrink-0 px-4 pb-3">
        <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
          {FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setFilter(tab.value)}
              className={[
                'shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-colors',
                filter === tab.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 active:bg-slate-700',
              ].join(' ')}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 bg-slate-100 rounded-t-3xl overflow-y-auto pb-2">
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-2xl bg-slate-200 animate-pulse" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-slate-400">
            <Bell className="h-14 w-14 mb-4 opacity-20" />
            <p className="text-base font-semibold">ไม่มีการแจ้งเตือน</p>
            <p className="text-sm mt-1">ลองเปลี่ยนตัวกรองเพื่อดูรายการอื่น</p>
          </div>
        ) : (
          <div className="px-3 pt-4 pb-4 space-y-2.5">
            {items.map((n) => {
              const Icon = SEV_ICON[n.severity] ?? Info
              return (
                <button
                  key={n.id}
                  onClick={() => { if (!n.isRead) markRead.mutate(n.id) }}
                  className={[
                    'w-full flex items-start gap-3.5 p-4 rounded-2xl border-2 text-left transition-all active:scale-[0.98]',
                    SEV_BG[n.severity] ?? 'border-slate-200 bg-white',
                    n.isRead ? 'opacity-55' : '',
                  ].join(' ')}
                >
                  {/* Severity icon */}
                  <div className="shrink-0 mt-0.5">
                    <Icon className={`h-6 w-6 ${SEV_COLOR[n.severity] ?? 'text-slate-400'}`} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-bold text-slate-900 text-sm leading-tight flex-1 min-w-0 truncate">
                        {n.title}
                      </p>
                      <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${SEV_BADGE[n.severity] ?? ''}`}>
                        {SEV_LABEL[n.severity]}
                      </span>
                      {!n.isRead && (
                        <span className="shrink-0 h-2.5 w-2.5 rounded-full bg-blue-500" />
                      )}
                    </div>
                    <p className="text-slate-600 text-sm leading-snug line-clamp-2">{n.message}</p>
                    <p className="text-slate-400 text-xs mt-1.5">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: th })}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <MobileBottomNav />
    </div>
  )
}
