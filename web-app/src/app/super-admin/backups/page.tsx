'use client'

import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  DatabaseBackup, Download, RotateCcw, CheckCircle2, XCircle,
  Clock, Loader2, RefreshCw, ChevronRight, AlertTriangle,
  ShieldAlert, Archive,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  listTenants, listBackupJobs, listRestoreJobs,
  startBackup, validateBackup, startRestore, getBackupJob,
  downloadUrl,
  type TenantInfo, type BackupJob, type RestoreJob, type ValidationResult,
} from '@/lib/tenant-backup'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso?: string) {
  if (!iso) return '—'
  return format(new Date(iso), 'd MMM yy HH:mm', { locale: th })
}

function fmtBytes(n?: number) {
  if (!n) return '—'
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 ** 2).toFixed(1)} MB`
}

function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    RUNNING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    VALIDATING: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
    DRY_RUN: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
    RESTORING: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    SUCCESS: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    FAILED: 'bg-red-500/15 text-red-400 border-red-500/30',
    ROLLED_BACK: 'bg-red-500/15 text-red-400 border-red-500/30',
    EXPIRED: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  }
  const label: Record<string, string> = {
    RUNNING: 'กำลังทำงาน', VALIDATING: 'ตรวจสอบ', DRY_RUN: 'ทดสอบ',
    RESTORING: 'กำลัง Restore', SUCCESS: 'สำเร็จ', FAILED: 'ล้มเหลว',
    ROLLED_BACK: 'ยกเลิกแล้ว', EXPIRED: 'หมดอายุ',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', map[status] ?? map.EXPIRED)}>
      {status === 'RUNNING' || status === 'RESTORING' || status === 'VALIDATING'
        ? <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        : null}
      {label[status] ?? status}
    </span>
  )
}

// ── Restore wizard ────────────────────────────────────────────────────────────

interface RestoreWizardProps {
  backupJob: BackupJob
  tenants: TenantInfo[]
  onClose: () => void
}

function RestoreWizard({ backupJob, tenants, onClose }: RestoreWizardProps) {
  const qc = useQueryClient()
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1)
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [restoreJobId, setRestoreJobId] = useState<string | null>(null)

  const destinationTenantId = backupJob.tenantIds[0] // SAME_TENANT only

  const destTenant = tenants.find((t) => t.id === destinationTenantId)

  const validateMut = useMutation({
    mutationFn: () => validateBackup(backupJob.id),
    onSuccess: (result) => {
      setValidation(result)
      setStep(3)
    },
  })

  const restoreMut = useMutation({
    mutationFn: () =>
      startRestore(backupJob.id, 'SAME_TENANT', destinationTenantId),
    onSuccess: (job) => {
      setRestoreJobId(job.id)
      qc.invalidateQueries({ queryKey: ['restore-jobs'] })
      setStep(5)
    },
    onError: (err) => {
      console.error('[RestoreWizard] startRestore failed:', err)
    },
  })

  const { data: restoreJob } = useQuery({
    queryKey: ['restore-job', restoreJobId],
    queryFn: () => import('@/lib/tenant-backup').then((m) => m.getRestoreJob(restoreJobId!)),
    enabled: !!restoreJobId && step === 5,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'SUCCESS' || status === 'FAILED' || status === 'ROLLED_BACK' ? false : 2000
    },
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-xl bg-slate-900 border border-slate-700 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-orange-400" />
            <span className="font-semibold text-slate-100">Restore Wizard</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-xl leading-none">×</button>
        </div>

        {/* Step indicators */}
        <div className="flex gap-1 px-6 pt-4 pb-0">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={cn(
              'h-1.5 flex-1 rounded-full transition-colors',
              step >= s ? 'bg-orange-500' : 'bg-slate-700',
            )} />
          ))}
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 min-h-[200px]">

          {/* Step 1: Select backup info */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="font-medium text-slate-100">ขั้นตอน 1: เลือก Backup ที่จะ Restore</h3>
              <div className="rounded-lg bg-slate-800 border border-slate-700 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Backup Job</span>
                  <span className="text-slate-200 font-mono text-xs">{backupJob.id.slice(0, 16)}…</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">สร้างเมื่อ</span>
                  <span className="text-slate-200">{fmtDate(backupJob.startedAt)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">ร้านค้า</span>
                  <span className="text-slate-200">{destTenant?.shopName ?? destinationTenantId}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">ขนาด</span>
                  <span className="text-slate-200">{fmtBytes(backupJob.sizeBytes)}</span>
                </div>
              </div>
              <div className="rounded-lg bg-orange-500/10 border border-orange-500/30 p-3 flex gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
                <p className="text-xs text-orange-300">
                  การ Restore จะลบข้อมูลปัจจุบันของร้านค้านี้และแทนที่ด้วยข้อมูลจาก Backup
                  ระบบจะสร้าง Backup อัตโนมัติก่อน Restore เพื่อความปลอดภัย
                </p>
              </div>
              <Button className="w-full" onClick={() => setStep(2)}>
                ถัดไป <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Step 2: Validate */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="font-medium text-slate-100">ขั้นตอน 2: ตรวจสอบ Backup</h3>
              <p className="text-sm text-slate-400">ระบบจะตรวจสอบ checksum, schema version, FK integrity และ accounting balance</p>
              {validateMut.isPending
                ? <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> กำลังตรวจสอบ…</div>
                : validateMut.isError
                  ? <p className="text-sm text-red-400">{String(validateMut.error)}</p>
                  : null}
              <Button
                className="w-full"
                onClick={() => validateMut.mutate()}
                disabled={validateMut.isPending}
              >
                {validateMut.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />ตรวจสอบ…</> : 'เริ่มตรวจสอบ'}
              </Button>
            </div>
          )}

          {/* Step 3: Validation results + destination */}
          {step === 3 && validation && (
            <div className="space-y-4">
              <h3 className="font-medium text-slate-100">ขั้นตอน 3: ผลการตรวจสอบ</h3>
              <div className="space-y-1.5">
                {[
                  { label: 'ไฟล์อ่านได้', ok: validation.readable },
                  { label: 'Checksum ถูกต้อง', ok: validation.checksumValid },
                  { label: 'Schema เข้ากันได้', ok: validation.schemaCompatible },
                  { label: 'ข้อมูลครบถ้วน', ok: validation.tenantDataValid },
                  { label: 'Accounting สมดุล (DR=CR)', ok: validation.accountingValid },
                ].map((r) => (
                  <div key={r.label} className="flex items-center gap-2 text-sm">
                    {r.ok
                      ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      : <XCircle className="h-4 w-4 text-red-400" />}
                    <span className={r.ok ? 'text-slate-300' : 'text-red-300'}>{r.label}</span>
                  </div>
                ))}
              </div>

              {validation.warnings.length > 0 && (
                <div className="rounded bg-yellow-500/10 border border-yellow-500/30 p-3 space-y-1">
                  {validation.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-300">⚠ {w}</p>
                  ))}
                </div>
              )}
              {validation.errors.length > 0 && (
                <div className="rounded bg-red-500/10 border border-red-500/30 p-3 space-y-1">
                  {validation.errors.map((e, i) => (
                    <p key={i} className="text-xs text-red-300">✗ {e}</p>
                  ))}
                </div>
              )}

              <div className="rounded-lg bg-slate-800 border border-slate-700 p-3">
                <p className="text-xs text-slate-400 mb-1">ปลายทาง (เฉพาะ SAME_TENANT)</p>
                <p className="text-sm font-medium text-slate-200">{destTenant?.shopName ?? destinationTenantId}</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>ย้อนกลับ</Button>
                <Button
                  className="flex-1"
                  disabled={validation.errors.length > 0}
                  onClick={() => setStep(4)}
                >
                  ถัดไป <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Preview + confirm */}
          {step === 4 && (
            <div className="space-y-4">
              <h3 className="font-medium text-slate-100">ขั้นตอน 4: ยืนยัน Restore</h3>
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 p-3 space-y-2">
                <div className="flex gap-2">
                  <ShieldAlert className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-300">
                    การ Restore จะ<strong>ลบข้อมูลทั้งหมด</strong>ของร้าน <strong>{destTenant?.shopName}</strong> แล้วแทนที่ด้วยข้อมูลจาก Backup
                    การกระทำนี้<strong>ไม่สามารถยกเลิก</strong>ได้ (ยกเว้นใช้ pre-restore backup ที่ระบบสร้างให้อัตโนมัติ)
                  </p>
                </div>
              </div>
              <div>
                <p className="text-sm text-slate-400 mb-2">พิมพ์ <code className="bg-slate-700 px-1 py-0.5 rounded text-slate-200">RESTORE</code> เพื่อยืนยัน</p>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="RESTORE"
                  className="w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>ย้อนกลับ</Button>
                <Button
                  className="flex-1 bg-red-600 hover:bg-red-700"
                  disabled={confirmText !== 'RESTORE' || restoreMut.isPending}
                  onClick={() => restoreMut.mutate()}
                >
                  {restoreMut.isPending
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />กำลัง Restore…</>
                    : 'RESTORE'}
                </Button>
              </div>
              {restoreMut.isError && (
                <p className="text-xs text-red-400">{String(restoreMut.error)}</p>
              )}
            </div>
          )}

          {/* Step 5: Progress */}
          {step === 5 && (
            <div className="space-y-4">
              <h3 className="font-medium text-slate-100">ขั้นตอน 5: ดำเนินการ Restore</h3>
              {restoreJob
                ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <JobStatusBadge status={restoreJob.status} />
                      <span className="text-sm text-slate-400">{fmtDate(restoreJob.startedAt)}</span>
                    </div>
                    {restoreJob.preRestoreBackupId && (
                      <p className="text-xs text-slate-500">
                        Pre-restore backup: <code className="text-slate-400">{restoreJob.preRestoreBackupId}</code>
                      </p>
                    )}
                    {restoreJob.status === 'SUCCESS' && (
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="h-5 w-5" />
                        <span className="font-medium">Restore สำเร็จ!</span>
                      </div>
                    )}
                    {(restoreJob.status === 'FAILED' || restoreJob.status === 'ROLLED_BACK') && (
                      <div className="rounded bg-red-500/10 border border-red-500/30 p-3">
                        <p className="text-sm text-red-300">{restoreJob.error ?? 'เกิดข้อผิดพลาด'}</p>
                      </div>
                    )}
                  </div>
                )
                : <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="h-4 w-4 animate-spin" />รอผลลัพธ์…</div>
              }
              <Button className="w-full" onClick={onClose} variant="outline">ปิด</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BackupCenterPage() {
  const qc = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [restoreTarget, setRestoreTarget] = useState<BackupJob | null>(null)

  const { data: tenants = [], isLoading: loadingTenants, refetch: refetchTenants } = useQuery({
    queryKey: ['backup-tenants'],
    queryFn: listTenants,
    staleTime: 30_000,
  })

  const { data: backupJobs = [], isLoading: loadingJobs, refetch: refetchJobs } = useQuery({
    queryKey: ['backup-jobs'],
    queryFn: listBackupJobs,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const running = query.state.data?.some((j: BackupJob) => j.status === 'RUNNING')
      return running ? 3000 : false
    },
  })

  const { data: restoreJobs = [] } = useQuery({
    queryKey: ['restore-jobs'],
    queryFn: listRestoreJobs,
    staleTime: 10_000,
    refetchInterval: (query) => {
      const running = query.state.data?.some((j: RestoreJob) =>
        j.status === 'RUNNING' || j.status === 'RESTORING' || j.status === 'VALIDATING',
      )
      return running ? 3000 : false
    },
  })

  const backupMut = useMutation({
    mutationFn: (ids: string[]) => startBackup(ids),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backup-jobs'] })
      qc.invalidateQueries({ queryKey: ['backup-tenants'] })
      setSelected(new Set())
    },
    onError: (err) => {
      console.error('[BackupCenter] startBackup failed:', err)
    },
  })

  const toggleAll = useCallback(() => {
    if (selected.size === tenants.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(tenants.map((t) => t.id)))
    }
  }, [selected, tenants])

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })

  const handleBackup = (ids: string[]) => {
    if (backupMut.isPending) return
    backupMut.mutate(ids)
  }

  // Find the most recent successful backup for a given tenantId
  const latestSuccess = useCallback((tenantId: string): BackupJob | undefined => {
    return backupJobs
      .filter((j) => j.status === 'SUCCESS' && j.tenantIds.includes(tenantId))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())[0]
  }, [backupJobs])

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DatabaseBackup className="h-6 w-6 text-blue-400" />
          <div>
            <h1 className="text-xl font-semibold text-slate-100">Backup Center</h1>
            <p className="text-sm text-slate-400">สำรองและกู้คืนข้อมูลร้านค้า (Tenant-level)</p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchTenants(); refetchJobs() }}
        >
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> รีเฟรช
        </Button>
      </div>

      {/* Tenant table */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <span className="text-sm font-medium text-slate-300">ร้านค้าทั้งหมด</span>
          <div className="flex items-center gap-2">
            {backupMut.isError && (
              <p className="text-xs text-red-400 max-w-xs truncate">
                Backup ล้มเหลว: {String((backupMut.error as { message?: string })?.message ?? backupMut.error)}
              </p>
            )}
            {selected.size > 0 && (
              <Button
                size="sm"
                onClick={() => handleBackup(Array.from(selected))}
                disabled={backupMut.isPending}
              >
                {backupMut.isPending
                  ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />กำลัง Backup…</>
                  : <><DatabaseBackup className="mr-1.5 h-3.5 w-3.5" />Backup {selected.size} ร้าน</>}
              </Button>
            )}
            {tenants.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => handleBackup(tenants.map((t) => t.id))} disabled={backupMut.isPending}>
                Backup ทั้งหมด ({tenants.length})
              </Button>
            )}
          </div>
        </div>

        {loadingTenants
          ? (
            <div className="flex items-center justify-center py-12 gap-2 text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" /> กำลังโหลด…
            </div>
          )
          : tenants.length === 0
            ? <p className="py-8 text-center text-sm text-slate-500">ไม่พบร้านค้า</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="w-10 py-3 pl-4 text-left">
                      <input
                        type="checkbox"
                        checked={selected.size === tenants.length && tenants.length > 0}
                        onChange={toggleAll}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500"
                      />
                    </th>
                    <th className="py-3 px-4 text-left font-medium text-slate-400">ร้านค้า</th>
                    <th className="py-3 px-4 text-left font-medium text-slate-400 hidden md:table-cell">แผน</th>
                    <th className="py-3 px-4 text-left font-medium text-slate-400 hidden lg:table-cell">Backup ล่าสุด</th>
                    <th className="py-3 px-4 text-left font-medium text-slate-400 hidden lg:table-cell">ขนาด</th>
                    <th className="py-3 pr-4 text-right font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tenants.map((tenant) => {
                    const last = latestSuccess(tenant.id) ?? tenant.lastBackup
                    return (
                      <tr key={tenant.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3 pl-4">
                          <input
                            type="checkbox"
                            checked={selected.has(tenant.id)}
                            onChange={() => toggle(tenant.id)}
                            className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-blue-500"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <p className="font-medium text-slate-200">{tenant.shopName}</p>
                          <p className="text-xs text-slate-500">{tenant.ownerName}</p>
                        </td>
                        <td className="py-3 px-4 hidden md:table-cell">
                          <Badge variant="outline" className="text-xs">{tenant.plan}</Badge>
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell text-slate-400">
                          {last ? fmtDate(last.startedAt ?? last.completedAt) : '—'}
                        </td>
                        <td className="py-3 px-4 hidden lg:table-cell text-slate-400">
                          {last ? fmtBytes(last.sizeBytes) : '—'}
                        </td>
                        <td className="py-3 pr-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={() => handleBackup([tenant.id])}
                              disabled={backupMut.isPending}
                            >
                              <DatabaseBackup className="mr-1 h-3 w-3" /> Backup
                            </Button>
                            {last && (
                              <>
                                <a
                                  href={downloadUrl(last.id)}
                                  download
                                  className="inline-flex items-center h-7 px-2 rounded-md border border-slate-700 bg-transparent text-xs text-slate-300 hover:bg-slate-800 transition-colors"
                                >
                                  <Download className="mr-1 h-3 w-3" /> Download
                                </a>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs border-orange-700 text-orange-400 hover:bg-orange-900/30"
                                  onClick={() => setRestoreTarget(last)}
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" /> Restore
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
        }
      </div>

      {/* Backup job history */}
      <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-medium text-slate-300">ประวัติ Backup</span>
          </div>
        </div>

        {loadingJobs
          ? <div className="flex items-center justify-center py-8 gap-2 text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด…</div>
          : backupJobs.length === 0
            ? <p className="py-6 text-center text-sm text-slate-500">ยังไม่มีประวัติ Backup</p>
            : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="py-2 px-4 text-left font-medium text-slate-400">Job ID</th>
                    <th className="py-2 px-4 text-left font-medium text-slate-400">ประเภท</th>
                    <th className="py-2 px-4 text-left font-medium text-slate-400">สถานะ</th>
                    <th className="py-2 px-4 text-left font-medium text-slate-400 hidden md:table-cell">เริ่มเมื่อ</th>
                    <th className="py-2 px-4 text-left font-medium text-slate-400 hidden lg:table-cell">ขนาด</th>
                    <th className="py-2 pr-4 text-right font-medium text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {backupJobs.slice(0, 20).map((job) => (
                    <tr key={job.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-400">{job.id.slice(0, 8)}…</td>
                      <td className="py-2.5 px-4 text-slate-400">{job.backupType === 'SINGLE_TENANT' ? 'Single' : 'Multi'}</td>
                      <td className="py-2.5 px-4"><JobStatusBadge status={job.status} /></td>
                      <td className="py-2.5 px-4 text-slate-400 hidden md:table-cell">{fmtDate(job.startedAt)}</td>
                      <td className="py-2.5 px-4 text-slate-400 hidden lg:table-cell">{fmtBytes(job.sizeBytes)}</td>
                      <td className="py-2.5 pr-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {job.status === 'SUCCESS' && (
                            <>
                              <a
                                href={downloadUrl(job.id)}
                                download
                                className="inline-flex items-center h-6 px-2 rounded border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition-colors"
                              >
                                <Download className="mr-1 h-3 w-3" /> DL
                              </a>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-xs border-orange-800 text-orange-400 hover:bg-orange-900/30"
                                onClick={() => setRestoreTarget(job)}
                              >
                                <RotateCcw className="mr-1 h-3 w-3" /> Restore
                              </Button>
                            </>
                          )}
                          {job.status === 'FAILED' && job.error && (
                            <span className="text-xs text-red-400 max-w-[200px] truncate">{job.error}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
        }
      </div>

      {/* Restore job history */}
      {restoreJobs.length > 0 && (
        <div className="rounded-xl border border-slate-700 bg-slate-900 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
            <RotateCcw className="h-4 w-4 text-orange-400" />
            <span className="text-sm font-medium text-slate-300">ประวัติ Restore</span>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800">
                <th className="py-2 px-4 text-left font-medium text-slate-400">Job ID</th>
                <th className="py-2 px-4 text-left font-medium text-slate-400">สถานะ</th>
                <th className="py-2 px-4 text-left font-medium text-slate-400 hidden md:table-cell">เริ่มเมื่อ</th>
                <th className="py-2 px-4 text-left font-medium text-slate-400 hidden lg:table-cell">ร้านค้า</th>
                <th className="py-2 px-4 text-left font-medium text-slate-400">ผู้ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {restoreJobs.slice(0, 10).map((job) => {
                const dest = tenants.find((t) => t.id === job.destinationTenantId)
                return (
                  <tr key={job.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono text-xs text-slate-400">{job.id.slice(0, 8)}…</td>
                    <td className="py-2.5 px-4"><JobStatusBadge status={job.status} /></td>
                    <td className="py-2.5 px-4 text-slate-400 hidden md:table-cell">{fmtDate(job.startedAt)}</td>
                    <td className="py-2.5 px-4 text-slate-300 hidden lg:table-cell">{dest?.shopName ?? job.destinationTenantId}</td>
                    <td className="py-2.5 px-4 text-slate-400">{job.createdByName}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Restore wizard modal */}
      {restoreTarget && (
        <RestoreWizard
          backupJob={restoreTarget}
          tenants={tenants}
          onClose={() => setRestoreTarget(null)}
        />
      )}
    </div>
  )
}
