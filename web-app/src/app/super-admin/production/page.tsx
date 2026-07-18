'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Activity, Database, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, Server, ShieldCheck, Clock, Wrench, ShoppingCart,
  Package, Users, Loader2,
} from 'lucide-react'
import { SuperAdminStatCard } from '@/components/super-admin/stat-card'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { cn } from '@/lib/utils'

// ── Types ─────────────────────────────────────────────────────────────────────

interface HealthResponse {
  status: 'ok' | 'error'
  db: 'ok' | 'unreachable'
  timestamp: string
}

interface BackupStatus {
  pgDumpAvailable: boolean
  backupDir: string
  backupCount: number
  lastBackup: { filename: string; sizeFormatted: string; modifiedAt: string } | null
  offsiteEnabled?: boolean
}

interface DashboardOverview {
  openRepairs: number
  totalRepairs: number
  todaySales: number
  todayRevenue: number
  lowStockCount: number
  totalProducts: number
  totalCustomers: number
}

// ── Status chip ───────────────────────────────────────────────────────────────

function StatusChip({ ok, label, failLabel }: { ok: boolean | undefined; label: string; failLabel?: string }) {
  if (ok === undefined) return (
    <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-700 text-slate-400">
      <Loader2 className="h-3 w-3 animate-spin" /> กำลังตรวจสอบ
    </span>
  )
  if (ok) return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-900/60 text-emerald-300 border border-emerald-800">
      <CheckCircle2 className="h-3 w-3" /> {label}
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-red-900/60 text-red-300 border border-red-800">
      <XCircle className="h-3 w-3" /> {failLabel ?? label}
    </span>
  )
}

// ── Section card (dark-themed for super-admin) ─────────────────────────────────

function DarkCard({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('bg-slate-900 border border-slate-800 rounded-2xl p-5', className)}>
      <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4">{title}</h3>
      {children}
    </div>
  )
}

// ── Check row ─────────────────────────────────────────────────────────────────

function CheckRow({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: React.ElementType
  label: string
  value?: string
  status: 'ok' | 'warn' | 'fail' | 'loading'
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
      <div className="flex items-center gap-2.5">
        <Icon className="h-4 w-4 text-slate-500 shrink-0" />
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className="text-xs text-slate-500">{value}</span>}
        {status === 'loading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
        {status === 'ok'   && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
        {status === 'warn' && <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
        {status === 'fail' && <XCircle       className="h-3.5 w-3.5 text-red-400" />}
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery<HealthResponse>({
    queryKey: ['production-health'],
    queryFn: () => api.get('/health').then((r) => r.data),
    staleTime: 30_000,
    retry: 1,
  })

  const { data: backup, isLoading: backupLoading, refetch: refetchBackup } = useQuery<BackupStatus>({
    queryKey: ['backup-status'],
    queryFn: () => api.get('/backup/status').then((r) => r.data),
    staleTime: 60_000,
  })

  const { data: overview, isLoading: overviewLoading } = useQuery<DashboardOverview>({
    queryKey: ['production-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data),
    staleTime: 60_000,
  })

  const handleRefresh = () => {
    refetchHealth()
    refetchBackup()
  }

  // Derived readiness signals
  const dbOk       = health?.db === 'ok'
  const apiOk      = !!health && health.status === 'ok'
  const backupOk   = !!(backup?.pgDumpAvailable && backup.backupCount > 0)
  const offsiteOk  = backup?.offsiteEnabled

  const readySignals = [apiOk, dbOk, backupOk]
  const readyCount   = readySignals.filter(Boolean).length
  const isReady      = readyCount === readySignals.length

  const lastBackupAt = backup?.lastBackup?.modifiedAt
    ? format(new Date(backup.lastBackup.modifiedAt), "d MMM yyyy HH:mm น.", { locale: th })
    : null

  const nowStr = format(new Date(), "d MMM yyyy HH:mm น.", { locale: th })

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Production Dashboard</h1>
          <p className="text-slate-400 text-sm mt-0.5">ตรวจสอบสถานะระบบ Production สำหรับ Pilot Store</p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white"
        >
          <RefreshCw className="h-4 w-4 mr-1.5" />
          รีเฟรช
        </Button>
      </div>

      {/* Acceptance banner */}
      <div className={cn(
        'rounded-2xl border p-4 flex items-center gap-4',
        healthLoading || backupLoading
          ? 'border-slate-700 bg-slate-900'
          : isReady
            ? 'border-emerald-800 bg-emerald-950/60'
            : 'border-red-800 bg-red-950/40',
      )}>
        <div className={cn(
          'flex h-10 w-10 items-center justify-center rounded-xl shrink-0',
          isReady ? 'bg-emerald-900' : 'bg-red-900',
        )}>
          <ShieldCheck className={cn('h-5 w-5', isReady ? 'text-emerald-400' : 'text-red-400')} />
        </div>
        <div className="flex-1">
          <p className={cn('font-semibold text-sm', isReady ? 'text-emerald-300' : 'text-red-300')}>
            {healthLoading || backupLoading
              ? 'กำลังตรวจสอบความพร้อม...'
              : isReady
                ? 'ระบบพร้อมสำหรับ Pilot Store ✓'
                : `ยังไม่พร้อม — ผ่านแล้ว ${readyCount}/${readySignals.length} เกณฑ์`}
          </p>
          <p className="text-slate-400 text-xs mt-0.5">ตรวจสอบเมื่อ {nowStr}</p>
        </div>
      </div>

      {/* System status row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <DarkCard title="API Server">
          <div className="space-y-1">
            <StatusChip ok={healthLoading ? undefined : apiOk} label="ออนไลน์" failLabel="ออฟไลน์" />
            {health?.timestamp && (
              <p className="text-slate-500 text-xs mt-2">
                ตอบสนองเมื่อ {format(new Date(health.timestamp), 'HH:mm:ss')}
              </p>
            )}
          </div>
        </DarkCard>

        <DarkCard title="Database">
          <div className="space-y-1">
            <StatusChip ok={healthLoading ? undefined : dbOk} label="เชื่อมต่อได้" failLabel="ไม่ตอบสนอง" />
            {dbOk && (
              <p className="text-slate-500 text-xs mt-2">PostgreSQL ตอบสนองปกติ</p>
            )}
          </div>
        </DarkCard>

        <DarkCard title="Backup">
          <div className="space-y-1">
            <StatusChip ok={backupLoading ? undefined : backupOk} label="พร้อม" failLabel="ยังไม่มี Backup" />
            {backup && (
              <p className="text-slate-500 text-xs mt-2">
                {backup.backupCount} ไฟล์
                {lastBackupAt ? ` · ล่าสุด ${lastBackupAt}` : ''}
              </p>
            )}
          </div>
        </DarkCard>
      </div>

      {/* Live metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <SuperAdminStatCard
          label="งานซ่อมเปิดอยู่"
          value={overviewLoading ? '—' : (overview?.openRepairs ?? 0)}
          sub={`จากทั้งหมด ${overview?.totalRepairs ?? '…'} งาน`}
          icon={Wrench}
          accent="amber"
        />
        <SuperAdminStatCard
          label="ยอดขายวันนี้"
          value={overviewLoading ? '—' : `฿${(overview?.todayRevenue ?? 0).toLocaleString()}`}
          sub={`${overview?.todaySales ?? '…'} รายการ`}
          icon={ShoppingCart}
          accent="emerald"
        />
        <SuperAdminStatCard
          label="สินค้าสต็อกน้อย"
          value={overviewLoading ? '—' : (overview?.lowStockCount ?? 0)}
          sub={`จาก ${overview?.totalProducts ?? '…'} รายการ`}
          icon={Package}
          accent={overview && overview.lowStockCount > 0 ? 'red' : 'slate'}
        />
        <SuperAdminStatCard
          label="ลูกค้าทั้งหมด"
          value={overviewLoading ? '—' : (overview?.totalCustomers ?? 0)}
          sub="ลงทะเบียนในระบบ"
          icon={Users}
          accent="blue"
        />
      </div>

      {/* Detailed checks */}
      <DarkCard title="รายการตรวจสอบสำหรับ Pilot">
        <CheckRow
          icon={Server}
          label="API Server ทำงานปกติ"
          status={healthLoading ? 'loading' : apiOk ? 'ok' : 'fail'}
          value={health?.timestamp ? `เวลา ${format(new Date(health.timestamp), 'HH:mm:ss')}` : undefined}
        />
        <CheckRow
          icon={Database}
          label="Database เชื่อมต่อได้"
          status={healthLoading ? 'loading' : dbOk ? 'ok' : 'fail'}
        />
        <CheckRow
          icon={Activity}
          label="pg_dump พร้อมใช้งาน"
          status={backupLoading ? 'loading' : backup?.pgDumpAvailable ? 'ok' : 'fail'}
        />
        <CheckRow
          icon={Clock}
          label="มี Backup ล่าสุด"
          status={backupLoading ? 'loading' : backupOk ? 'ok' : 'fail'}
          value={backup?.lastBackup?.sizeFormatted}
        />
        <CheckRow
          icon={Database}
          label="Offsite Backup (S3)"
          status={backupLoading ? 'loading' : offsiteOk ? 'ok' : 'warn'}
          value={offsiteOk ? 'เปิดใช้งาน' : 'ไม่ได้เปิดใช้งาน'}
        />
      </DarkCard>

      {/* Acceptance report */}
      <DarkCard title="Acceptance Report">
        <AcceptanceReport
          health={health}
          backup={backup}
          overview={overview}
          loading={healthLoading || backupLoading || overviewLoading}
        />
      </DarkCard>
    </div>
  )
}

// ── Acceptance Report ─────────────────────────────────────────────────────────

function AcceptanceReport({
  health,
  backup,
  overview,
  loading,
}: {
  health?: HealthResponse
  backup?: BackupStatus
  overview?: DashboardOverview
  loading: boolean
}) {
  const nowStr = format(new Date(), "d MMMM yyyy HH:mm น.", { locale: th })

  const criteria = [
    {
      label: 'API Server ทำงานปกติ',
      pass: health?.status === 'ok',
    },
    {
      label: 'Database เชื่อมต่อสำเร็จ',
      pass: health?.db === 'ok',
    },
    {
      label: 'ระบบ Backup พร้อมและมีข้อมูล',
      pass: !!(backup?.pgDumpAvailable && backup.backupCount > 0),
    },
    {
      label: 'ข้อมูลสินค้าในระบบ (ตรวจสอบด้วยตาว่าถูกต้อง)',
      pass: (overview?.totalProducts ?? 0) > 0,
    },
    {
      label: 'ลูกค้าในระบบ (มีข้อมูลจริง)',
      pass: (overview?.totalCustomers ?? 0) > 0,
    },
  ]

  const passCount = criteria.filter((c) => c.pass).length
  const allPass   = passCount === criteria.length

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        กำลังตรวจสอบเกณฑ์...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        {criteria.map((c, i) => (
          <div key={i} className="flex items-center gap-2.5 py-1.5">
            {c.pass
              ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              : <XCircle      className="h-4 w-4 text-red-400 shrink-0" />}
            <span className={cn('text-sm', c.pass ? 'text-slate-200' : 'text-red-300')}>
              {c.label}
            </span>
          </div>
        ))}
      </div>

      <div className={cn(
        'rounded-xl border p-4 mt-2',
        allPass
          ? 'border-emerald-800 bg-emerald-950/50'
          : 'border-red-800 bg-red-950/40',
      )}>
        <div className="flex items-center gap-2">
          <ShieldCheck className={cn('h-5 w-5', allPass ? 'text-emerald-400' : 'text-red-400')} />
          <p className={cn('font-semibold text-sm', allPass ? 'text-emerald-300' : 'text-red-300')}>
            {allPass ? 'READY — ระบบพร้อมสำหรับการใช้งานจริง' : `NOT READY — ผ่านแล้ว ${passCount}/${criteria.length} เกณฑ์`}
          </p>
        </div>
        <p className="text-slate-400 text-xs mt-1.5">
          วันที่ตรวจสอบ: {nowStr}
        </p>
        {!allPass && (
          <p className="text-red-300/70 text-xs mt-1">
            แก้ไขรายการที่ไม่ผ่านก่อนเปิดให้บริการลูกค้า
          </p>
        )}
      </div>
    </div>
  )
}
