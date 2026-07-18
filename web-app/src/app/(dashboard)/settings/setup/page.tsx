'use client'

import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import {
  Store, Phone, Receipt, Image, Bell, Database, Wifi,
  CheckCircle2, XCircle, AlertCircle, ChevronRight, Loader2,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackupStatus {
  pgDumpAvailable: boolean
  backupCount: number
  lastBackup: { filename: string } | null
  offsiteEnabled?: boolean
}

interface LineStatus {
  enabled: boolean
}

interface CheckItem {
  key: string
  label: string
  description: string
  href: string
  icon: React.ElementType
  done: boolean
  optional?: boolean
}

// ── Status icon ───────────────────────────────────────────────────────────────

function StatusIcon({ done, optional }: { done: boolean; optional?: boolean }) {
  if (done)     return <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
  if (optional) return <AlertCircle  className="h-5 w-5 text-yellow-500 shrink-0" />
  return              <XCircle       className="h-5 w-5 text-red-400 shrink-0" />
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SetupPage() {
  const { data: settings, isLoading: settingsLoading } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: backupStatus } = useQuery<BackupStatus>({
    queryKey: ['backup-status'],
    queryFn: () => api.get('/backup/status').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: lineStatus } = useQuery<LineStatus>({
    queryKey: ['line-notify-status'],
    queryFn: () => api.get('/notifications/line/status').then((r) => r.data).catch(() => ({ enabled: false })),
    staleTime: 60_000,
  })

  const isLoading = settingsLoading

  const checks: CheckItem[] = [
    {
      key: 'shopName',
      label: 'ชื่อร้าน',
      description: 'ตั้งชื่อร้านที่จะแสดงบนใบเสร็จและหน้าจอ',
      href: '/settings',
      icon: Store,
      done: !!(settings?.shopName && settings.shopName !== 'ร้านซ่อม'),
    },
    {
      key: 'shopPhone',
      label: 'เบอร์โทรศัพท์ร้าน',
      description: 'เบอร์โทรที่แสดงบนใบเสร็จ',
      href: '/settings',
      icon: Phone,
      done: !!settings?.shopPhone,
    },
    {
      key: 'taxId',
      label: 'เลขผู้เสียภาษี',
      description: 'จำเป็นสำหรับใบเสร็จแบบมีภาษี',
      href: '/settings',
      icon: Receipt,
      done: !!settings?.taxId,
      optional: true,
    },
    {
      key: 'logo',
      label: 'โลโก้ร้าน',
      description: 'โลโก้แสดงบนใบเสร็จและหน้าจอต้อนรับ',
      href: '/settings',
      icon: Image,
      done: !!settings?.logoUrl,
      optional: true,
    },
    {
      key: 'receiptFooter',
      label: 'ข้อความท้ายใบเสร็จ',
      description: 'เช่น "ขอบคุณที่ใช้บริการ" หรือนโยบายการรับประกัน',
      href: '/settings',
      icon: Receipt,
      done: !!settings?.receiptFooter,
      optional: true,
    },
    {
      key: 'paymentQr',
      label: 'QR Code พร้อมเพย์',
      description: 'รูป QR สำหรับรับชำระผ่านพร้อมเพย์',
      href: '/settings',
      icon: Image,
      done: !!settings?.paymentQrUrl,
      optional: true,
    },
    {
      key: 'lineNotify',
      label: 'LINE Notification',
      description: 'แจ้งเตือนเมื่อมีงานใหม่ / ลูกค้ามารับ',
      href: '/settings/line',
      icon: Bell,
      done: !!lineStatus?.enabled,
      optional: true,
    },
    {
      key: 'backup',
      label: 'Backup อัตโนมัติ',
      description: 'ระบบสำรองข้อมูลทำงานอยู่และมี backup ล่าสุด',
      href: '/settings/backup',
      icon: Database,
      done: !!(backupStatus?.pgDumpAvailable && backupStatus.backupCount > 0),
    },
  ]

  const required  = checks.filter((c) => !c.optional)
  const optional  = checks.filter((c) =>  c.optional)
  const doneCount = checks.filter((c) => c.done).length
  const reqDone   = required.filter((c) => c.done).length
  const allReqDone = reqDone === required.length

  const pct = Math.round((doneCount / checks.length) * 100)

  return (
    <div className="space-y-6">
      <PageHeader
        title="การตั้งค่าเริ่มต้น"
        subtitle="ตรวจสอบและกรอกข้อมูลร้านก่อนเปิดใช้งานจริง"
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Progress summary */}
          <SectionCard title="ความคืบหน้า">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  ทำเสร็จแล้ว {doneCount} / {checks.length} รายการ
                </span>
                <span className={allReqDone ? 'text-green-600 font-medium' : 'text-orange-600 font-medium'}>
                  {allReqDone ? 'รายการจำเป็นครบแล้ว ✓' : `ยังขาดรายการจำเป็น ${required.length - reqDone} รายการ`}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    pct === 100 ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : 'bg-orange-400'
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {pct}% เสร็จสมบูรณ์
              </p>
            </div>
          </SectionCard>

          {/* Required items */}
          <SectionCard title="รายการจำเป็น">
            <div className="divide-y">
              {required.map((item) => (
                <CheckRow key={item.key} item={item} />
              ))}
            </div>
          </SectionCard>

          {/* Optional items */}
          <SectionCard title="รายการแนะนำ (ไม่บังคับ)">
            <div className="divide-y">
              {optional.map((item) => (
                <CheckRow key={item.key} item={item} />
              ))}
            </div>
          </SectionCard>

          {/* Hardware shortcut */}
          <SectionCard title="ฮาร์ดแวร์">
            <Link
              href="/settings/hardware"
              className="flex items-center justify-between p-1 rounded-lg hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950">
                  <Wifi className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">ตรวจสอบฮาร์ดแวร์</p>
                  <p className="text-xs text-muted-foreground">เครื่องพิมพ์ กล้อง เครือข่าย</p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </SectionCard>
        </>
      )}
    </div>
  )
}

// ── CheckRow component ────────────────────────────────────────────────────────

function CheckRow({ item }: { item: CheckItem }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className="flex items-center gap-3 py-3 px-1 rounded-lg hover:bg-muted/50 transition-colors group"
    >
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${
        item.done
          ? 'bg-green-50 dark:bg-green-950'
          : item.optional
            ? 'bg-yellow-50 dark:bg-yellow-950'
            : 'bg-red-50 dark:bg-red-950'
      }`}>
        <Icon className={`h-5 w-5 ${
          item.done ? 'text-green-600' : item.optional ? 'text-yellow-600' : 'text-red-500'
        }`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.label}</p>
        <p className="text-xs text-muted-foreground truncate">{item.description}</p>
      </div>
      <StatusIcon done={item.done} optional={item.optional} />
      <ChevronRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
    </Link>
  )
}
