'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Database, Download, RefreshCw, Play, Loader2, Clock,
  CheckCircle2, AlertTriangle, FileArchive, Trash2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import api from '@/lib/api'

interface BackupStatus {
  pgDumpAvailable: boolean
  backupDir: string
  backupCount: number
  lastBackup: BackupFile | null
}

interface BackupFile {
  filename: string
  sizeBytes: number
  sizeFormatted: string
  createdAt: string
  modifiedAt: string
}

export default function BackupPage() {
  const qc = useQueryClient()
  const [purging, setPurging] = useState(false)

  const { data: status, isLoading: statusLoading } = useQuery<BackupStatus>({
    queryKey: ['backup-status'],
    queryFn: () => api.get('/backup/status').then((r) => r.data),
    staleTime: 30_000,
  })

  const { data: files = [], isLoading: filesLoading } = useQuery<BackupFile[]>({
    queryKey: ['backup-list'],
    queryFn: () => api.get('/backup/list').then((r) => r.data),
    staleTime: 30_000,
  })

  const createMutation = useMutation({
    mutationFn: () => api.post('/backup/create'),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['backup-status'] })
      qc.invalidateQueries({ queryKey: ['backup-list'] })
      toast.success(`Backup สำเร็จ: ${res.data.filename} (${res.data.sizeFormatted})`)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message ?? 'Backup ล้มเหลว')
    },
  })

  const handlePurge = async () => {
    if (!confirm('ลบ backup เก่าที่เกินระยะเวลา retention? จะยังคงเก็บล่าสุด 7 ไฟล์ไว้')) return
    setPurging(true)
    try {
      const res = await api.post('/backup/purge')
      const { deleted, kept } = res.data
      qc.invalidateQueries({ queryKey: ['backup-list'] })
      qc.invalidateQueries({ queryKey: ['backup-status'] })
      toast.success(`ลบ ${deleted.length} ไฟล์ · เหลือ ${kept} ไฟล์`)
    } catch (err: any) {
      toast.error(err.response?.data?.message ?? 'เกิดข้อผิดพลาด')
    } finally {
      setPurging(false)
    }
  }

  const handleDownload = (filename: string) => {
    const backendUrl = process.env.NEXT_PUBLIC_API_URL?.replace('/api/v1', '') ?? ''
    window.open(`${backendUrl}/api/v1/backup/download/${encodeURIComponent(filename)}`, '_blank')
  }

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['backup-status'] })
    qc.invalidateQueries({ queryKey: ['backup-list'] })
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Backup & Restore"
        subtitle="สำรองข้อมูลอัตโนมัติทุกวัน 02:00 น. · เก็บไฟล์ล่าสุด 30 วัน"
        icon={Database}
        secondaryActions={
          <Button variant="outline" size="sm" onClick={refreshAll} className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            รีเฟรช
          </Button>
        }
      />

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* pg_dump status */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">pg_dump</p>
              {statusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : status?.pgDumpAvailable ? (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  พร้อมใช้
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-semibold text-red-500">
                  <AlertTriangle className="h-4 w-4" />
                  ไม่พบ
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Total backups */}
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-col gap-2">
              <p className="text-xs text-muted-foreground">จำนวน backup</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">
                {statusLoading ? '—' : (status?.backupCount ?? 0)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Last backup */}
        <Card className="col-span-2">
          <CardContent className="pt-4 pb-3">
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">backup ล่าสุด</p>
              {statusLoading ? (
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              ) : status?.lastBackup ? (
                <>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {status.lastBackup.filename}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {format(new Date(status.lastBackup.createdAt), 'dd MMM yy HH:mm', { locale: th })}
                    <span className="ml-1">· {status.lastBackup.sizeFormatted}</span>
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">ยังไม่มี backup</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Manual backup */}
      <SectionCard title="สร้าง Backup ทันที">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              สร้างไฟล์ backup ทันที โดยใช้ pg_dump ดัมพ์ฐานข้อมูลทั้งหมดเป็นไฟล์ .sql
            </p>
            {!status?.pgDumpAvailable && !statusLoading && (
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                ไม่พบ pg_dump — กรุณาติดตั้ง PostgreSQL client tools
              </p>
            )}
          </div>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !status?.pgDumpAvailable}
            className="gap-2 shrink-0"
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Backup เดี๋ยวนี้
          </Button>
        </div>
      </SectionCard>

      {/* Auto backup info */}
      <SectionCard title="Auto Backup">
        <div className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-400">
          <Clock className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-slate-800 dark:text-slate-200">ทุกวัน เวลา 02:00 น. (เซิร์ฟเวอร์)</p>
            <p>ระบบจะสร้าง backup อัตโนมัติ และส่งแจ้งเตือนเมื่อสำเร็จหรือล้มเหลว</p>
            <p>เก็บไฟล์ล่าสุด 30 วัน (อย่างน้อย 7 ไฟล์เสมอ)</p>
          </div>
        </div>
      </SectionCard>

      {/* Backup list */}
      <SectionCard
        title={`ไฟล์ Backup ทั้งหมด (${files.length})`}
        headerAction={
          files.length > 7 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePurge}
              disabled={purging}
              className="gap-2 text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
            >
              {purging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              ลบเก่า
            </Button>
          ) : undefined
        }
      >
        {filesLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : files.length === 0 ? (
          <EmptyState
            icon={FileArchive}
            title="ยังไม่มีไฟล์ backup"
            description="กด 'Backup เดี๋ยวนี้' หรือรอ auto backup เวลา 02:00 น."
          />
        ) : (
          <div className="divide-y dark:divide-slate-700 -mx-1">
            {files.map((file, i) => (
              <div key={file.filename} className="flex items-center gap-3 px-1 py-3">
                <FileArchive className="h-4 w-4 text-slate-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-slate-800 dark:text-slate-200 truncate">
                    {file.filename}
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                    <span>{format(new Date(file.createdAt), 'dd MMM yy HH:mm', { locale: th })}</span>
                    <span>·</span>
                    <span>{file.sizeFormatted}</span>
                    {i === 0 && (
                      <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400 font-medium">
                        <CheckCircle2 className="h-3 w-3" />
                        ล่าสุด
                      </span>
                    )}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDownload(file.filename)}
                  className="gap-1.5 shrink-0"
                >
                  <Download className="h-3.5 w-3.5" />
                  ดาวน์โหลด
                </Button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}
