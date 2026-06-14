'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Database, Download, RefreshCw, CheckCircle2, XCircle,
  AlertTriangle, HardDrive, FolderOpen, Clock, Shield,
} from 'lucide-react'
import { format, formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface BackupFile {
  filename:      string
  sizeBytes:     number
  sizeFormatted: string
  createdAt:     string
  modifiedAt:    string
}

interface BackupStatus {
  pgDumpAvailable: boolean
  backupDir:       string
  backupCount:     number
  lastBackup:      BackupFile | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function BackupPage() {
  const router  = useRouter()
  const hasPerm = useAuthStore((s) => s.hasPermission)
  const qc      = useQueryClient()
  const [lastCreated, setLastCreated] = useState<BackupFile | null>(null)

  const authorized = hasPerm('system.backup')

  const { data: status, isLoading: statusLoading, refetch: refetchStatus } =
    useQuery<BackupStatus>({
      queryKey: ['backup', 'status'],
      queryFn:  async () => (await api.get('/backup/status')).data,
      staleTime: 30_000,
      enabled:  authorized,
    })

  const { data: files = [], isLoading: filesLoading, refetch: refetchFiles } =
    useQuery<BackupFile[]>({
      queryKey: ['backup', 'list'],
      queryFn:  async () => (await api.get('/backup/list')).data,
      staleTime: 30_000,
      enabled:  authorized,
    })

  const createBackup = useMutation({
    mutationFn: async () => (await api.post('/backup/create')).data as BackupFile,
    onSuccess: (data) => {
      setLastCreated(data)
      qc.invalidateQueries({ queryKey: ['backup'] })
    },
  })

  if (!authorized) {
    router.replace('/403')
    return null
  }

  function handleRefresh() {
    refetchStatus()
    refetchFiles()
  }

  function downloadUrl(filename: string) {
    const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
    return `${base}/backup/download/${encodeURIComponent(filename)}`
  }

  const isLoading = statusLoading || filesLoading

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <PageHeader
        title="Backup ข้อมูล"
        icon={Database}
        subtitle="สำรองและกู้คืนข้อมูลระบบ"
        primaryAction={
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            รีเฟรช
          </Button>
        }
      />

      {/* Success banner */}
      {lastCreated && (
        <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
          <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">Backup สำเร็จ</p>
            <p className="text-xs text-green-700 mt-0.5">
              ไฟล์: <span className="font-mono">{lastCreated.filename}</span>
              {' '}({lastCreated.sizeFormatted})
            </p>
          </div>
          <button
            onClick={() => setLastCreated(null)}
            className="text-green-500 hover:text-green-700 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Error banner */}
      {createBackup.isError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Backup ล้มเหลว</p>
            <p className="text-xs text-red-700 mt-0.5">
              {(createBackup.error as any)?.response?.data?.message ?? 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'}
            </p>
          </div>
        </div>
      )}

      {/* Status card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* pg_dump status */}
        <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${
            status?.pgDumpAvailable ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {status?.pgDumpAvailable
              ? <CheckCircle2 className="h-5 w-5 text-green-600" />
              : <XCircle className="h-5 w-5 text-red-500" />}
          </div>
          <div>
            <p className="text-xs text-slate-500 font-medium">pg_dump</p>
            <p className={`text-sm font-semibold ${
              status?.pgDumpAvailable ? 'text-green-700' : 'text-red-600'
            }`}>
              {statusLoading ? '...' : status?.pgDumpAvailable ? 'พร้อมใช้งาน' : 'ไม่พบ'}
            </p>
          </div>
        </div>

        {/* Backup directory */}
        <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-blue-100 flex items-center justify-center">
            <FolderOpen className="h-5 w-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium">จำนวน Backup</p>
            <p className="text-sm font-semibold text-slate-800">
              {statusLoading ? '...' : `${status?.backupCount ?? 0} ไฟล์`}
            </p>
          </div>
        </div>

        {/* Last backup */}
        <div className="flex items-center gap-3 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="h-10 w-10 rounded-xl bg-amber-100 flex items-center justify-center">
            <Clock className="h-5 w-5 text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 font-medium">Backup ล่าสุด</p>
            <p className="text-sm font-semibold text-slate-800 truncate">
              {statusLoading
                ? '...'
                : status?.lastBackup
                  ? formatDistanceToNow(new Date(status.lastBackup.createdAt), {
                      addSuffix: true, locale: th,
                    })
                  : 'ยังไม่มี'}
            </p>
          </div>
        </div>
      </div>

      {/* Backup directory path */}
      {status?.backupDir && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
          <HardDrive className="h-4 w-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500">โฟลเดอร์:</span>
          <code className="text-xs text-slate-700 font-mono truncate">{status.backupDir}</code>
        </div>
      )}

      {/* Create backup button + warning */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
        <div className="flex-1">
          <p className="text-sm font-semibold text-blue-900">สร้าง Backup ใหม่</p>
          <p className="text-xs text-blue-700 mt-0.5">
            สร้างไฟล์ SQL dump ของฐานข้อมูลปัจจุบัน อาจใช้เวลาสักครู่ขึ้นอยู่กับขนาดข้อมูล
          </p>
        </div>
        <Button
          onClick={() => createBackup.mutate()}
          disabled={createBackup.isPending || !status?.pgDumpAvailable}
          className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shrink-0"
        >
          {createBackup.isPending ? (
            <>
              <RefreshCw className="h-4 w-4 animate-spin" />
              กำลังสร้าง...
            </>
          ) : (
            <>
              <Database className="h-4 w-4" />
              สร้าง Backup
            </>
          )}
        </Button>
      </div>

      {/* Restore warning */}
      <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <Shield className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-amber-800">การ Restore ข้อมูล</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">
            การ Restore ต้องทำด้วยตนเองโดยผู้ดูแลระบบเท่านั้น
            กรุณาดาวน์โหลดไฟล์ SQL และรันคำสั่ง psql ในสภาพแวดล้อมที่ต้องการ
            <br />
            <code className="font-mono text-amber-800 bg-amber-100 px-1 rounded">
              psql -h HOST -U USER -d DBNAME &lt; backup.sql
            </code>
          </p>
        </div>
      </div>

      {/* Backup file list */}
      <div>
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          รายการ Backup ({files.length} ไฟล์)
        </h2>

        {filesLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="py-12 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <Database className="h-10 w-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">ยังไม่มีไฟล์ Backup</p>
            <p className="text-xs mt-1">กดปุ่ม &ldquo;สร้าง Backup&rdquo; เพื่อเริ่มต้น</p>
          </div>
        ) : (
          <div className="space-y-2">
            {files.map((f, idx) => (
              <div
                key={f.filename}
                className="flex items-center gap-4 p-4 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                  <Database className="h-4 w-4 text-slate-500" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-mono font-medium text-slate-800 truncate">
                      {f.filename}
                    </p>
                    {idx === 0 && (
                      <Badge className="bg-green-100 text-green-700 text-[10px] shrink-0">
                        ล่าสุด
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                    <span>{f.sizeFormatted}</span>
                    <span>•</span>
                    <span title={format(new Date(f.createdAt), 'dd/MM/yyyy HH:mm:ss', { locale: th })}>
                      {formatDistanceToNow(new Date(f.createdAt), { addSuffix: true, locale: th })}
                    </span>
                    <span className="hidden sm:inline">
                      • {format(new Date(f.createdAt), 'dd MMM yyyy HH:mm', { locale: th })}
                    </span>
                  </div>
                </div>

                <a
                  href={downloadUrl(f.filename)}
                  download={f.filename}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">ดาวน์โหลด</span>
                </a>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer note */}
      <div className="flex items-center gap-2 text-xs text-slate-400 pt-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span>
          เฉพาะ DEV เท่านั้น — ห้าม Restore โดยตรงกับฐานข้อมูล PROD
        </span>
      </div>
    </div>
  )
}
