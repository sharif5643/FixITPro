'use client'

import { useMemo } from 'react'
import Link from 'next/link'
import { Activity, Bell, ChevronRight } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { Skel, PCard, SEV_CFG, CardHeader } from './primitives'
import type { DashboardOverview, SeverityKey } from './types'

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { locale: th, addSuffix: true })
  } catch {
    return ''
  }
}

interface TimelineItem {
  id: string
  title: string
  sub: string
  severity: SeverityKey
  time: string
  dedupeKey: string
}

interface Props {
  notifications: DashboardOverview['notifications'] | undefined
  activities: DashboardOverview['recentActivities'] | undefined
  loading: boolean
}

export function AlertsTimeline({ notifications, activities, loading }: Props) {
  const items: TimelineItem[] = useMemo(() => {
    const seen = new Set<string>()

    const notifs: TimelineItem[] = (notifications?.latest ?? []).map(n => ({
      id: n.id,
      title: n.title,
      sub: n.message,
      severity: (n.severity as SeverityKey) ?? 'INFO',
      time: n.createdAt,
      dedupeKey: `${n.type}:${n.title}`,
    }))

    const acts: TimelineItem[] = (activities ?? []).map(a => ({
      id: a.id,
      title: a.action.replace(/_/g, ' ').toLowerCase(),
      sub: a.actorName ?? '',
      severity: 'INFO' as SeverityKey,
      time: a.createdAt,
      dedupeKey: `activity:${a.action}:${a.actorName}`,
    }))

    return [...notifs, ...acts]
      .filter(item => {
        if (seen.has(item.dedupeKey)) return false
        seen.add(item.dedupeKey)
        return true
      })
      .sort((a, b) => {
        const severityDiff = (SEV_CFG[a.severity]?.order ?? 3) - (SEV_CFG[b.severity]?.order ?? 3)
        if (severityDiff !== 0) return severityDiff
        return new Date(b.time).getTime() - new Date(a.time).getTime()
      })
      .slice(0, 7)
  }, [notifications, activities])

  return (
    <PCard className="p-5">
      <CardHeader
        icon={Activity} iconBg="bg-rose-50 dark:bg-rose-900/20" iconColor="text-rose-500"
        title="Timeline วันนี้"
      >
        {notifications && notifications.unreadCount > 0 && (
          <span className="text-[10px] font-bold bg-red-500 text-white rounded-full px-1.5 py-0.5 leading-none ml-1" aria-label={`${notifications.unreadCount} แจ้งเตือนที่ยังไม่ได้อ่าน`}>
            {notifications.unreadCount}
          </span>
        )}
        <Link
          href="/notifications"
          className="ml-auto text-[10px] text-blue-500 font-semibold hover:underline flex items-center gap-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
        >
          ดูทั้งหมด <ChevronRight className="h-3 w-3" aria-hidden />
        </Link>
      </CardHeader>

      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <Skel key={i} className="h-11 w-full" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center py-8 text-slate-400 gap-2">
          <Bell className="h-8 w-8 opacity-25" aria-hidden />
          <p className="text-sm">ไม่มีการแจ้งเตือนวันนี้</p>
        </div>
      ) : (
        <ol className="space-y-2" aria-label="รายการแจ้งเตือนล่าสุด">
          {items.map(item => {
            const cfg = SEV_CFG[item.severity] ?? SEV_CFG.INFO
            return (
              <li key={item.id} className={cn('flex items-start gap-2.5 rounded-xl border px-3 py-2', cfg.cls)}>
                <span className={cn('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', cfg.dot)} aria-hidden />
                <div className="flex-1 min-w-0">
                  <p className={cn('text-xs font-semibold line-clamp-1', cfg.text)}>{item.title}</p>
                  {item.sub && (
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{item.sub}</p>
                  )}
                </div>
                <time className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0" dateTime={item.time}>
                  {relativeTime(item.time)}
                </time>
              </li>
            )
          })}
        </ol>
      )}
    </PCard>
  )
}
