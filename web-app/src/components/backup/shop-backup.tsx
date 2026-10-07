'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { CheckCircle2, Database, Download, Loader2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/ui/page-header'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'

export interface ShopBackup {
  id: string
  status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'
  startedAt: string
  completedAt?: string
  sizeBytes?: number
  createdByName?: string
  counts?: Record<string, number> | null
}

export function useShopBackups(enabled = true) {
  return useQuery<ShopBackup[]>({
    queryKey: ['shop-backups'],
    queryFn:  async () => (await api.get('/shop-backups')).data,
    // While one is being made, check again every few seconds
    refetchInterval: (q) => ((q.state.data ?? []).some((b) => b.status === 'RUNNING') ? 3000 : false),
    enabled,
  })
}

const size = (n?: number) => (n == null ? '-' : n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** The shop owner's backups of their own shop: make one, download it. */
export function ShopBackupPage() {
  const qc = useQueryClient()
  const { data: backups = [], isLoading } = useShopBackups()
  const create = useMutation({
    mutationFn: () => api.post('/shop-backups'),
    onSuccess: () => { toast.success('กำลังสำรองข้อมูลร้าน — เสร็จแล้วกดดาวน์โหลดได้'); qc.invalidateQueries({ queryKey: ['shop-backups'] }) },
    onError: (e) => toast.error(apiErrorMessage(e, 'สำรองข้อมูลไม่สำเร็จ')),
  })
  const download = async (b: ShopBackup) => {
    try {
      const res = await api.get(`/shop-backups/${b.id}/download`, { responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `shop-backup-${format(new Date(b.startedAt), 'yyyyMMdd-HHmm')}.tar.gz`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      toast.error(apiErrorMessage(e, 'ดาวน์โหลดไม่สำเร็จ'))
    }
  }
  const running = backups.some((b) => b.status === 'RUNNING')

  return (
    <div className="space-y-5">
      <PageHeader title="สำรองข้อมูลร้าน" icon={Database} subtitle="เก็บข้อมูลทั้งหมดของร้านคุณเป็นไฟล์ — สินค้า ลูกค้า บิล งานซ่อม กะ และอื่นๆ" />

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5 space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          ไฟล์สำรองเก็บไว้บนเซิร์ฟเวอร์ และดาวน์โหลดเก็บไว้เองได้ ไม่มีรหัสผ่านหรือ token อยู่ในไฟล์
          ถ้าต้องการกู้คืน ติดต่อผู้ดูแลระบบพร้อมไฟล์นี้
        </p>
        <Button onClick={() => create.mutate()} disabled={create.isPending || running} className="gap-2">
          {create.isPending || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Database className="h-4 w-4" />}
          {running ? 'กำลังสำรองข้อมูล...' : 'สำรองข้อมูลตอนนี้'}
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-200">ไฟล์สำรองล่าสุด</div>
        {isLoading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : backups.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">ยังไม่มีไฟล์สำรอง</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {backups.map((b) => (
              <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                {b.status === 'SUCCESS' ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                  : b.status === 'RUNNING' ? <Loader2 className="h-5 w-5 shrink-0 animate-spin text-blue-600" />
                  : <XCircle className="h-5 w-5 shrink-0 text-red-500" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {format(new Date(b.startedAt), 'd MMM yyyy HH:mm', { locale: th })} น.
                  </p>
                  <p className="text-xs text-slate-500">
                    {b.status === 'SUCCESS' ? `${size(b.sizeBytes)} · บิล ${b.counts?.sales ?? 0} · งานซ่อม ${b.counts?.repairs ?? 0} · ลูกค้า ${b.counts?.customers ?? 0}`
                      : b.status === 'RUNNING' ? 'กำลังสำรอง...' : 'ไม่สำเร็จ'}
                    {b.createdByName ? ` · โดย ${b.createdByName}` : ''}
                  </p>
                </div>
                {b.status === 'SUCCESS' && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => download(b)}>
                    <Download className="h-4 w-4" /> ดาวน์โหลด
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
