'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Loader2,
  CalendarDays,
  Crown,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  GitBranch,
} from 'lucide-react'
import { formatThaiMoney } from '@/lib/utils'
import { PageHeader } from '@/components/ui/page-header'
import api from '@/lib/api'

interface SubscriptionRenewal {
  id: string
  action: string
  plan?: string
  duration?: number
  expiryDate: string
  amount?: number | null
  note?: string | null
  createdAt: string
}

interface SubscriptionData {
  id: number | string
  planName: string
  plan?: string
  branchLimit?: string
  status: string
  effectiveStatus: string
  daysRemaining: number
  startDate: string | null
  expiryDate: string
  notes?: string | null
  renewals: SubscriptionRenewal[]
}

const STATUS_CONFIG: Record<string, { label: string; cls: string; icon: React.ElementType }> = {
  TRIAL:     { label: 'ทดลองใช้',     cls: 'bg-blue-50 text-blue-700 border-blue-200',    icon: Clock },
  ACTIVE:    { label: 'ใช้งานอยู่',   cls: 'bg-green-50 text-green-700 border-green-200', icon: CheckCircle2 },
  EXPIRED:   { label: 'หมดอายุแล้ว', cls: 'bg-red-50 text-red-700 border-red-200',        icon: XCircle },
  SUSPENDED: { label: 'ถูกระงับ',     cls: 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60',    icon: AlertTriangle },
  PENDING:   { label: 'รอเปิดใช้งาน', cls: 'bg-blue-50 text-blue-600 border-blue-200',   icon: Clock },
}

const ACTION_LABEL: Record<string, string> = {
  RENEWED:   'ต่ออายุ',
  ACTIVATED: 'เปิดใช้งาน',
  EXTENDED:  'ขยายเวลา',
  SUSPENDED: 'ระงับ',
  TRIAL:     'ทดลองใช้',
  RENEW:     'ต่ออายุ',
}

function fmtDate(d: string | null | undefined) {
  if (!d) return '—'
  try { return format(new Date(d), 'dd MMMM yyyy', { locale: th }) } catch { return d }
}

export default function SubscriptionPage() {
  const { data: sub, isLoading } = useQuery<SubscriptionData>({
    queryKey: ['subscription'],
    queryFn: async () => (await api.get('/subscription')).data,
    staleTime: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }

  if (!sub) return null

  const cfg          = STATUS_CONFIG[sub.effectiveStatus] ?? STATUS_CONFIG['TRIAL']
  const StatusIcon   = cfg.icon
  const isExpired    = sub.effectiveStatus === 'EXPIRED'
  const isWarning    = !isExpired && sub.daysRemaining <= 7 && sub.daysRemaining > 0
  const isNearExpiry = !isExpired && sub.daysRemaining <= 30 && sub.daysRemaining > 7

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="สถานะ Subscription"
        icon={Crown}
        subtitle="ดูสถานะแพ็กเกจและประวัติการต่ออายุ"
      />

      {/* Expiry Alert Banners */}
      {isExpired && (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-5 py-4">
          <XCircle className="h-5 w-5 text-red-600 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">แพ็กเกจหมดอายุแล้ว</p>
            <p className="text-sm text-red-700">กรุณาต่ออายุเพื่อใช้งานระบบต่อ หรือติดต่อผู้ดูแลระบบ</p>
          </div>
        </div>
      )}
      {isWarning && (
        <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-5 py-4">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">แพ็กเกจใกล้หมดอายุ!</p>
            <p className="text-sm text-amber-700">
              เหลืออีก <span className="font-bold">{sub.daysRemaining} วัน</span> — กรุณาต่ออายุก่อนวันที่ {fmtDate(sub.expiryDate)}
            </p>
          </div>
        </div>
      )}
      {isNearExpiry && (
        <div className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4">
          <Clock className="h-5 w-5 text-blue-600 shrink-0" />
          <div>
            <p className="font-semibold text-blue-800">แจ้งเตือน</p>
            <p className="text-sm text-blue-700">
              แพ็กเกจจะหมดอายุในอีก {sub.daysRemaining} วัน ({fmtDate(sub.expiryDate)})
            </p>
          </div>
        </div>
      )}

      {/* Status Card */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <Crown className="h-7 w-7 text-blue-600" />
            </div>
            <div>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{sub.planName}</p>
              <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold mt-1 ${cfg.cls}`}>
                <StatusIcon className="h-3.5 w-3.5" />
                {cfg.label}
              </span>
            </div>
          </div>

          {/* Days remaining */}
          <div className="text-right shrink-0">
            {isExpired ? (
              <p className="text-2xl font-bold text-red-600">0</p>
            ) : (
              <p className={`text-2xl font-bold tabular-nums ${isWarning ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                {sub.daysRemaining}
              </p>
            )}
            <p className="text-xs text-muted-foreground">วันที่เหลือ</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mt-6 border-t pt-5">
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">วันเริ่มใช้งาน</p>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">{fmtDate(sub.startDate)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground">วันหมดอายุ</p>
              <p className={`text-sm font-semibold ${isExpired ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                {fmtDate(sub.expiryDate)}
              </p>
            </div>
          </div>
          {sub.branchLimit && (
            <div className="flex items-center gap-3">
              <GitBranch className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">จำนวนสาขา</p>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{sub.branchLimit}</p>
              </div>
            </div>
          )}
        </div>

        {sub.notes && (
          <p className="mt-4 text-sm text-muted-foreground border-t pt-4">{sub.notes}</p>
        )}

        {/* Contact CTA */}
        <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
          ต้องการต่ออายุหรือเปลี่ยนแพ็กเกจ กรุณาติดต่อ{' '}
          <span className="font-semibold text-blue-700">ผู้ดูแลระบบ</span>
        </div>
      </div>

      {/* Renewal History */}
      <div className="bg-white rounded-xl border p-6">
        <div className="flex items-center gap-2 mb-5">
          <RefreshCw className="h-4 w-4 text-blue-600" />
          <h2 className="font-semibold text-slate-900 dark:text-white">ประวัติการต่ออายุ</h2>
        </div>

        {sub.renewals.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40">
            ยังไม่มีประวัติการต่ออายุ
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  <th className="text-left px-4 py-2.5 font-medium">วันที่</th>
                  <th className="text-left px-4 py-2.5 font-medium">ประเภท</th>
                  <th className="text-left px-4 py-2.5 font-medium">วันหมดอายุใหม่</th>
                  <th className="text-right px-4 py-2.5 font-medium">ยอด</th>
                  <th className="text-left px-4 py-2.5 font-medium">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {sub.renewals.map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {fmtDate(r.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-blue-50 text-blue-700 border border-blue-100 px-2.5 py-0.5 text-xs font-semibold">
                        {ACTION_LABEL[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{fmtDate(r.expiryDate)}</td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {r.amount != null ? formatThaiMoney(Number(r.amount)) : '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">{r.note ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
