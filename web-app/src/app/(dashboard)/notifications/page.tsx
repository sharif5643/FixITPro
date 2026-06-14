'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Bell, CheckCheck, Info, AlertTriangle, AlertCircle, Zap, Filter,
} from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

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
  readAt: string | null
  createdAt: string
}

interface NotificationListResponse {
  items: Notification[]
  total: number
  page: number
  limit: number
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
  INFO:     'bg-blue-50 border-blue-100',
  WARNING:  'bg-amber-50 border-amber-100',
  ERROR:    'bg-red-50 border-red-100',
  CRITICAL: 'bg-red-100 border-red-200',
}

const SEV_BADGE: Record<string, string> = {
  INFO:     'bg-blue-100 text-blue-700',
  WARNING:  'bg-amber-100 text-amber-700',
  ERROR:    'bg-red-100 text-red-700',
  CRITICAL: 'bg-red-200 text-red-900',
}

const SEV_LABEL: Record<string, string> = {
  INFO:     'ข้อมูล',
  WARNING:  'เตือน',
  ERROR:    'ผิดพลาด',
  CRITICAL: 'วิกฤต',
}

const TYPE_LABEL: Record<string, string> = {
  LOW_STOCK:                  'สินค้าใกล้หมด',
  NEGATIVE_STOCK:             'สินค้าติดลบ',
  OVERDUE_AP:                 'AP เกินกำหนด',
  SHIFT_MISMATCH:             'เงินในลิ้นชักไม่ตรง',
  LARGE_REFUND:               'คืนเงินจำนวนมาก',
  VOID_SALE:                  'ยกเลิกบิล',
  OVERDUE_REPAIR:             'งานซ่อมเกินกำหนด',
  STOCK_TRANSFER_REQUESTED:   'ขอโอนสต๊อก',
  STOCK_TRANSFER_PENDING:     'คำขอโอนสต๊อก',
  STOCK_TRANSFER_APPROVED:    'อนุมัติโอนสต๊อก',
  STOCK_TRANSFER_REJECTED:    'ปฏิเสธโอนสต๊อก',
  STOCK_TRANSFER_IN_TRANSIT:  'ส่งสินค้าออกแล้ว',
  STOCK_TRANSFER_RECEIVED:    'รับสินค้าแล้ว',
  ROLE_PERMISSION_CHANGED:    'สิทธิ์การใช้งาน',
}

const TRANSFER_NOTIFICATION_TYPES = new Set([
  'STOCK_TRANSFER_REQUESTED',
  'STOCK_TRANSFER_PENDING',
  'STOCK_TRANSFER_APPROVED',
  'STOCK_TRANSFER_REJECTED',
  'STOCK_TRANSFER_IN_TRANSIT',
  'STOCK_TRANSFER_RECEIVED',
])

const LIMIT = 20

// ── Component ─────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const router   = useRouter()
  const hasPerm  = useAuthStore((s) => s.hasPermission)
  const qc       = useQueryClient()

  const [page, setPage]         = useState(1)
  const [isRead, setIsRead]     = useState<string>('all')
  const [severity, setSeverity] = useState<string>('all')
  const [type, setType]         = useState<string>('all')

  const authorized = hasPerm('notification.view')

  const params = new URLSearchParams()
  params.set('page',  String(page))
  params.set('limit', String(LIMIT))
  if (isRead !== 'all')   params.set('isRead',   isRead === 'unread' ? 'false' : 'true')
  if (severity !== 'all') params.set('severity', severity)
  if (type !== 'all')     params.set('type',     type)

  const { data, isLoading } = useQuery<NotificationListResponse>({
    queryKey: ['notifications', 'list', page, isRead, severity, type],
    queryFn:  async () => (await api.get(`/notifications?${params}`)).data,
    staleTime: 15_000,
    enabled:  authorized,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAll = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  if (!authorized) {
    router.replace('/403')
    return null
  }

  const items      = data?.items ?? []
  const total      = data?.total ?? 0
  const totalPages = Math.ceil(total / LIMIT)
  const unreadCount = items.filter((n) => !n.isRead).length

  function resetFilters() {
    setIsRead('all')
    setSeverity('all')
    setType('all')
    setPage(1)
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 space-y-5">
      <PageHeader
        title="การแจ้งเตือน"
        icon={Bell}
        subtitle={total > 0 ? `${total} รายการ` : 'ไม่มีการแจ้งเตือน'}
        primaryAction={
          unreadCount > 0 ? (
            <Button size="sm" variant="outline" onClick={() => markAll.mutate()} disabled={markAll.isPending} className="gap-1.5 text-xs">
              <CheckCheck className="h-3.5 w-3.5" />
              อ่านทั้งหมด
            </Button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <Filter className="h-4 w-4 text-slate-400 shrink-0" />

        <Select value={isRead} onValueChange={(v) => { setIsRead(v); setPage(1) }}>
          <SelectTrigger className="h-8 w-[120px] text-xs bg-white">
            <SelectValue placeholder="สถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทั้งหมด</SelectItem>
            <SelectItem value="unread">ยังไม่อ่าน</SelectItem>
            <SelectItem value="read">อ่านแล้ว</SelectItem>
          </SelectContent>
        </Select>

        <Select value={severity} onValueChange={(v) => { setSeverity(v); setPage(1) }}>
          <SelectTrigger className="h-8 w-[120px] text-xs bg-white">
            <SelectValue placeholder="ระดับ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกระดับ</SelectItem>
            <SelectItem value="CRITICAL">วิกฤต</SelectItem>
            <SelectItem value="ERROR">ผิดพลาด</SelectItem>
            <SelectItem value="WARNING">เตือน</SelectItem>
            <SelectItem value="INFO">ข้อมูล</SelectItem>
          </SelectContent>
        </Select>

        <Select value={type} onValueChange={(v) => { setType(v); setPage(1) }}>
          <SelectTrigger className="h-8 w-[160px] text-xs bg-white">
            <SelectValue placeholder="ประเภท" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">ทุกประเภท</SelectItem>
            {Object.entries(TYPE_LABEL).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        {(isRead !== 'all' || severity !== 'all' || type !== 'all') && (
          <button
            onClick={resetFilters}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-1"
          >
            ล้างตัวกรอง
          </button>
        )}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="text-sm font-medium">ไม่มีการแจ้งเตือน</p>
          <p className="text-xs mt-1">ลองเปลี่ยนตัวกรองเพื่อดูรายการอื่น</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((n) => {
            const Icon = SEV_ICON[n.severity] ?? Info
            const isTransfer = TRANSFER_NOTIFICATION_TYPES.has(n.type)
            return (
              <div
                key={n.id}
                onClick={() => {
                  if (isTransfer) {
                    if (!n.isRead) markRead.mutate(n.id)
                    const dest = n.entityId ? `/transfers?highlight=${n.entityId}` : '/transfers'
                    router.push(dest)
                  }
                }}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-all ${SEV_BG[n.severity]} ${
                  n.isRead ? 'opacity-60' : ''
                } ${isTransfer ? 'cursor-pointer hover:shadow-sm' : ''}`}
              >
                <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${SEV_COLOR[n.severity]}`} />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${SEV_BADGE[n.severity]}`}>
                      {SEV_LABEL[n.severity]}
                    </span>
                    {TYPE_LABEL[n.type] && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-600 font-medium">
                        {TYPE_LABEL[n.type]}
                      </span>
                    )}
                    {!n.isRead && (
                      <span className="ml-auto h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </div>

                  <p className="text-sm text-slate-600 mt-1 leading-snug">{n.message}</p>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span title={format(new Date(n.createdAt), 'dd/MM/yyyy HH:mm', { locale: th })}>
                        {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: th })}
                      </span>
                      {n.isRead && n.readAt && (
                        <span className="text-slate-300">
                          อ่านแล้ว {formatDistanceToNow(new Date(n.readAt), { addSuffix: true, locale: th })}
                        </span>
                      )}
                    </div>

                    {!n.isRead && (
                      <button
                        onClick={() => markRead.mutate(n.id)}
                        disabled={markRead.isPending}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        ทำเครื่องหมายว่าอ่านแล้ว
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs"
          >
            ก่อนหน้า
          </Button>
          <span className="text-sm text-slate-600 px-2">
            หน้า {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="text-xs"
          >
            ถัดไป
          </Button>
        </div>
      )}
    </div>
  )
}
