'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Users, Package, Wrench, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/ui/page-header'
import { apiErrorMessage } from '@/lib/utils'
import {
  getAllTransfers,
  acceptTransfer,
  rejectTransfer,
  deviceReceivedTransfer,
  startTransfer,
  completeTransfer,
  returnDeviceTransfer,
  TRANSFER_STATUS_LABEL,
  TERMINAL_STATUSES,
  type PartnerRepairTransfer,
  type PartnerTransferStatus,
} from '@/lib/partner-repair-transfers'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

function fmtDate(d?: string | null) {
  if (!d) return null
  try { return format(new Date(d), 'dd MMM yy HH:mm', { locale: th }) } catch { return d }
}

const STATUS_COLOR: Record<PartnerTransferStatus, string> = {
  PENDING_ACCEPTANCE: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  ACCEPTED:           'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-400',
  REJECTED:           'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  DEVICE_RECEIVED:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  IN_PROGRESS:        'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  COMPLETED:          'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  DEVICE_RETURNED:    'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
  OWNER_RECEIVED:     'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  CANCELLED:          'bg-slate-100 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400',
  RECALLED:           'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
}

function TransferCard({ transfer }: { transfer: PartnerRepairTransfer }) {
  const queryClient = useQueryClient()
  const [confirmReject,  setConfirmReject]  = useState(false)
  const [confirmComplete, setConfirmComplete] = useState(false)
  const [rejectNote,     setRejectNote]     = useState('')
  const [completeNote,   setCompleteNote]   = useState('')

  const info = transfer.sharedDeviceInfo as Record<string, unknown> | null

  const acceptMut = useMutation({
    mutationFn: () => acceptTransfer(transfer.id),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['partner-transfers'] }); toast.success('รับงานแล้ว') },
    onError:    (err: any) => toast.error(apiErrorMessage(err)),
  })
  const rejectMut = useMutation({
    mutationFn: () => rejectTransfer(transfer.id, rejectNote.trim() || undefined),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['partner-transfers'] }); setConfirmReject(false); toast.success('ปฏิเสธงานแล้ว') },
    onError:    (err: any) => toast.error(apiErrorMessage(err)),
  })
  const devRecvMut = useMutation({
    mutationFn: () => deviceReceivedTransfer(transfer.id),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['partner-transfers'] }); toast.success('ยืนยันรับเครื่องแล้ว') },
    onError:    (err: any) => toast.error(apiErrorMessage(err)),
  })
  const startMut = useMutation({
    mutationFn: () => startTransfer(transfer.id),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['partner-transfers'] }); toast.success('เริ่มซ่อมแล้ว') },
    onError:    (err: any) => toast.error(apiErrorMessage(err)),
  })
  const completeMut = useMutation({
    mutationFn: () => completeTransfer(transfer.id, completeNote.trim() || undefined),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['partner-transfers'] }); setConfirmComplete(false); toast.success('งานเสร็จแล้ว') },
    onError:    (err: any) => toast.error(apiErrorMessage(err)),
  })
  const returnMut = useMutation({
    mutationFn: () => returnDeviceTransfer(transfer.id),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['partner-transfers'] }); toast.success('ส่งคืนเครื่องแล้ว') },
    onError:    (err: any) => toast.error(apiErrorMessage(err)),
  })

  const isTerminal = TERMINAL_STATUSES.includes(transfer.status)

  return (
    <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[transfer.status]}`}>
            {TRANSFER_STATUS_LABEL[transfer.status]}
          </span>
          <p className="text-xs text-muted-foreground mt-1">{fmtDate(transfer.sentAt)}</p>
        </div>
        {transfer.agreedPartnerPrice != null && (
          <span className="text-base font-bold tabular-nums text-indigo-700 dark:text-indigo-400">
            ฿{Number(transfer.agreedPartnerPrice).toLocaleString()}
          </span>
        )}
      </div>

      {/* Device info (from sharedDeviceInfo only — NO customer data) */}
      {info && (
        <div className="rounded-lg bg-slate-50 dark:bg-slate-700/30 px-3 py-2 space-y-1 text-sm">
          {!!(info.deviceBrand && info.deviceModel) && (
            <p className="font-semibold text-slate-900 dark:text-white">
              {String(info.deviceBrand)} {String(info.deviceModel)}
              {info.deviceColor ? <span className="font-normal text-muted-foreground ml-1">({String(info.deviceColor)})</span> : null}
            </p>
          )}
          {!!info.issue && <p className="text-slate-600 dark:text-slate-400 text-xs">{String(info.issue)}</p>}
          {!!info.deviceImei && (
            <p className="text-xs text-muted-foreground font-mono">IMEI: {String(info.deviceImei)}</p>
          )}
        </div>
      )}

      {transfer.partnerWorkNote && (
        <p className="text-xs text-muted-foreground">หมายเหตุ: {transfer.partnerWorkNote}</p>
      )}

      {/* Actions */}
      {!isTerminal && !confirmReject && !confirmComplete && (
        <div className="flex flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-700/40">
          {transfer.status === 'PENDING_ACCEPTANCE' && (
            <>
              <Button size="sm" className="h-7 text-xs flex-1 bg-teal-600 hover:bg-teal-700 gap-1.5"
                onClick={() => acceptMut.mutate()} disabled={acceptMut.isPending}>
                {acceptMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                รับงาน
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-xs flex-1 text-red-600 border-red-200"
                onClick={() => setConfirmReject(true)}>
                ปฏิเสธ
              </Button>
            </>
          )}
          {transfer.status === 'ACCEPTED' && (
            <Button size="sm" className="h-7 text-xs w-full bg-blue-600 hover:bg-blue-700 gap-1.5"
              onClick={() => devRecvMut.mutate()} disabled={devRecvMut.isPending}>
              {devRecvMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Package className="h-3 w-3" />}
              รับเครื่องแล้ว
            </Button>
          )}
          {transfer.status === 'DEVICE_RECEIVED' && (
            <Button size="sm" className="h-7 text-xs w-full bg-purple-600 hover:bg-purple-700 gap-1.5"
              onClick={() => startMut.mutate()} disabled={startMut.isPending}>
              {startMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wrench className="h-3 w-3" />}
              เริ่มซ่อม
            </Button>
          )}
          {transfer.status === 'IN_PROGRESS' && (
            <Button size="sm" className="h-7 text-xs w-full bg-green-600 hover:bg-green-700 gap-1.5"
              onClick={() => setConfirmComplete(true)}>
              <CheckCircle2 className="h-3 w-3" />
              ซ่อมเสร็จแล้ว
            </Button>
          )}
          {transfer.status === 'COMPLETED' && (
            <Button size="sm" className="h-7 text-xs w-full bg-indigo-600 hover:bg-indigo-700 gap-1.5"
              onClick={() => returnMut.mutate()} disabled={returnMut.isPending}>
              {returnMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              ส่งคืนเครื่องแล้ว
            </Button>
          )}
          {transfer.status === 'DEVICE_RETURNED' && (
            <p className="text-xs text-muted-foreground w-full">รอร้านต้นทางยืนยันรับเครื่องคืน</p>
          )}
        </div>
      )}

      {/* Inline confirm: reject */}
      {confirmReject && (
        <div className="rounded-lg border border-red-200 dark:border-red-800/40 bg-red-50 dark:bg-red-900/10 p-3 space-y-2">
          <p className="text-xs font-medium text-red-700 dark:text-red-400">ยืนยันปฏิเสธงาน?</p>
          <textarea
            className="w-full text-xs p-2 rounded border border-red-200 dark:border-red-700/60 bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-red-400"
            rows={2}
            placeholder="เหตุผล (ไม่บังคับ)"
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setConfirmReject(false)}>ยกเลิก</Button>
            <Button size="sm" className="h-7 text-xs flex-1 bg-red-600 hover:bg-red-700"
              onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending}>
              {rejectMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ยืนยัน'}
            </Button>
          </div>
        </div>
      )}

      {/* Inline confirm: complete */}
      {confirmComplete && (
        <div className="rounded-lg border border-green-200 dark:border-green-800/40 bg-green-50 dark:bg-green-900/10 p-3 space-y-2">
          <p className="text-xs font-medium text-green-700 dark:text-green-400">ยืนยันงานซ่อมเสร็จ?</p>
          <textarea
            className="w-full text-xs p-2 rounded border border-green-200 dark:border-green-700/60 bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-green-400"
            rows={2}
            placeholder="บันทึกงาน (ไม่บังคับ)"
            value={completeNote}
            onChange={(e) => setCompleteNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setConfirmComplete(false)}>ยกเลิก</Button>
            <Button size="sm" className="h-7 text-xs flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => completeMut.mutate()} disabled={completeMut.isPending}>
              {completeMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ยืนยัน'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

type GroupKey = 'new' | 'waiting' | 'in-progress' | 'done' | 'history'
interface Group { key: GroupKey; label: string; icon: React.ElementType; statuses: PartnerTransferStatus[] }

const GROUPS: Group[] = [
  { key: 'new',         label: 'งานใหม่',            icon: Clock,         statuses: ['PENDING_ACCEPTANCE'] },
  { key: 'waiting',     label: 'รอรับเครื่อง',        icon: Package,       statuses: ['ACCEPTED'] },
  { key: 'in-progress', label: 'กำลังดำเนินการ',      icon: Wrench,        statuses: ['DEVICE_RECEIVED', 'IN_PROGRESS'] },
  { key: 'done',        label: 'เสร็จแล้ว / ส่งคืน',  icon: CheckCircle2,  statuses: ['COMPLETED', 'DEVICE_RETURNED'] },
  { key: 'history',     label: 'ประวัติ',              icon: RotateCcw,     statuses: ['OWNER_RECEIVED', 'CANCELLED', 'RECALLED', 'REJECTED'] },
]

export default function PartnerRepairsPage() {
  const { data: transfers = [], isLoading, error } = useQuery({
    queryKey: ['partner-transfers'],
    queryFn:  getAllTransfers,
    refetchInterval: 30_000,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-red-600 dark:text-red-400">โหลดข้อมูลไม่ได้</p>
      </div>
    )
  }

  const totalActive = transfers.filter(t => !TERMINAL_STATUSES.includes(t.status)).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="งานซ่อมพาร์ทเนอร์"
        subtitle="งานซ่อมที่ส่งมาจากร้านพาร์ทเนอร์"
        icon={Users}
      />

      {transfers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-12 text-center space-y-2">
          <Users className="h-10 w-10 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">ยังไม่มีงานซ่อมพาร์ทเนอร์</p>
          <p className="text-xs text-muted-foreground">เมื่อร้านพาร์ทเนอร์ส่งงานมา จะปรากฏที่นี่</p>
        </div>
      ) : (
        <div className="space-y-8">
          {GROUPS.map(({ key, label, icon: Icon, statuses }) => {
            const items = transfers.filter(t => statuses.includes(t.status))
            if (items.length === 0) return null
            return (
              <section key={key} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                    {label}
                  </h2>
                  <span className="ml-1 inline-flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                    {items.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.map(t => <TransferCard key={t.id} transfer={t} />)}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
