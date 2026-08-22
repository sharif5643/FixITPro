'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, Users, CheckCircle2, XCircle, Clock, Package, Wrench, RotateCcw, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import {
  hasAcceptedPartner,
  getTransferByRepair,
  cancelTransfer,
  recallTransfer,
  ownerReceivedTransfer,
  TRANSFER_STATUS_LABEL,
  TERMINAL_STATUSES,
  type PartnerTransferStatus,
} from '@/lib/partner-repair-transfers'
import { SendToPartnerDialog } from './SendToPartnerDialog'
import { QuotationPanel }      from './QuotationPanel'

interface Props {
  repair: {
    id: string
    ticketNumber: string
    deviceBrand: string
    deviceModel: string
    deviceColor?: string | null
    deviceImei?: string | null
    issue: string
    note?: string | null
    status: string
  }
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

function fmtDate(d?: string | null) {
  if (!d) return null
  try { return format(new Date(d), 'dd MMM yy HH:mm', { locale: th }) } catch { return d }
}

export function PartnerTransferPanel({ repair }: Props) {
  const queryClient = useQueryClient()
  const { user }    = useAuthStore()
  const isOwner     = user?.role === 'OWNER'

  const [sendOpen, setSendOpen]       = useState(false)
  const [recallNote, setRecallNote]   = useState('')
  const [cancelNote, setCancelNote]   = useState('')
  const [confirmRecall, setConfirmRecall]   = useState(false)
  const [confirmCancel, setConfirmCancel]   = useState(false)
  const [confirmOwnerRx, setConfirmOwnerRx] = useState(false)

  // 1. Check if tenant has accepted partners
  const { data: hasPartner, isLoading: loadingHasPartner } = useQuery({
    queryKey: ['has-accepted-partner'],
    queryFn:  hasAcceptedPartner,
    staleTime: 60_000,
  })

  // 2. Check if repair has an active/past transfer
  const { data: transfer, isLoading: loadingTransfer } = useQuery({
    queryKey: ['partner-transfer', repair.id],
    queryFn:  () => getTransferByRepair(repair.id),
    staleTime: 15_000,
  })

  // Mutations (Shop A only)
  const cancelMut = useMutation({
    mutationFn: () => cancelTransfer(transfer!.id, cancelNote.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-transfer', repair.id] })
      setConfirmCancel(false)
      setCancelNote('')
      toast.success('ยกเลิกการส่งงานแล้ว')
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  const recallMut = useMutation({
    mutationFn: () => recallTransfer(transfer!.id, recallNote.trim() || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-transfer', repair.id] })
      setConfirmRecall(false)
      setRecallNote('')
      toast.success('เรียกคืนงานซ่อมแล้ว')
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  const ownerRxMut = useMutation({
    mutationFn: () => ownerReceivedTransfer(transfer!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-transfer', repair.id] })
      setConfirmOwnerRx(false)
      toast.success('ยืนยันรับเครื่องคืนแล้ว')
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  // Loading state
  if (loadingHasPartner || loadingTransfer) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span>โหลดข้อมูลพาร์ทเนอร์...</span>
      </div>
    )
  }

  // If no partner and no transfer: show nothing
  if (!hasPartner && !transfer) return null

  // If repair is DELIVERED or CANCELLED, don't allow new transfers but still show existing ones
  const canSend = hasPartner &&
    !transfer &&
    repair.status !== 'DELIVERED' &&
    repair.status !== 'CANCELLED'

  const isTerminal = transfer ? TERMINAL_STATUSES.includes(transfer.status) : false
  const canCancel  = transfer?.status === 'PENDING_ACCEPTANCE'
  const canRecall  = isOwner && transfer?.status === 'ACCEPTED'
  const canOwnerRx = transfer?.status === 'DEVICE_RETURNED'

  return (
    <>
      <div className="rounded-xl border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50/50 dark:bg-indigo-900/10 p-4 space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide">
            <Users className="h-3.5 w-3.5" />
            งานพาร์ทเนอร์
          </div>
          {canSend && (
            <Button
              size="sm"
              onClick={() => setSendOpen(true)}
              className="h-7 text-xs gap-1.5 bg-indigo-600 hover:bg-indigo-700"
            >
              <Users className="h-3.5 w-3.5" />
              ส่งต่องานให้ Partner
            </Button>
          )}
        </div>

        {/* Transfer status card */}
        {transfer && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLOR[transfer.status]}`}>
                {TRANSFER_STATUS_LABEL[transfer.status]}
              </span>
              {transfer.sentAt && (
                <span className="text-xs text-muted-foreground">{fmtDate(transfer.sentAt)}</span>
              )}
            </div>

            {transfer.agreedPartnerPrice != null && (
              <div className="text-xs flex justify-between text-muted-foreground">
                <span>ราคาพาร์ทเนอร์</span>
                <span className="font-medium text-indigo-700 dark:text-indigo-400 tabular-nums">
                  ฿{Number(transfer.agreedPartnerPrice).toLocaleString()}
                </span>
              </div>
            )}

            {transfer.pricingNote && (
              <p className="text-xs text-muted-foreground">หมายเหตุ: {transfer.pricingNote}</p>
            )}

            {/* Timeline milestones */}
            <div className="space-y-1 text-xs text-muted-foreground">
              {transfer.acceptedAt  && <Milestone icon={CheckCircle2} color="text-teal-600"    label="รับงาน"              date={transfer.acceptedAt} />}
              {transfer.deviceReceivedAt && <Milestone icon={Package}      color="text-blue-600"   label="รับเครื่องแล้ว"      date={transfer.deviceReceivedAt} />}
              {transfer.partnerStartedAt && <Milestone icon={Wrench}       color="text-purple-600" label="เริ่มซ่อม"            date={transfer.partnerStartedAt} />}
              {transfer.completedAt  && <Milestone icon={CheckCircle2} color="text-green-600"  label="ซ่อมเสร็จ"           date={transfer.completedAt} />}
              {transfer.returnedAt   && <Milestone icon={RotateCcw}    color="text-indigo-600" label="ส่งคืนแล้ว"          date={transfer.returnedAt} />}
              {transfer.ownerReceivedAt && <Milestone icon={CheckCircle2} color="text-emerald-600" label="รับเครื่องคืนแล้ว" date={transfer.ownerReceivedAt} />}
              {transfer.cancelledAt  && <Milestone icon={XCircle}      color="text-slate-400"  label="ยกเลิกแล้ว"          date={transfer.cancelledAt} />}
              {transfer.recalledAt   && <Milestone icon={AlertTriangle} color="text-orange-500" label="เรียกคืนแล้ว"       date={transfer.recalledAt} />}
              {transfer.rejectedAt   && <Milestone icon={XCircle}      color="text-red-500"    label="ปฏิเสธ"              date={transfer.rejectedAt} />}
            </div>

            {transfer.completionNote && (
              <p className="text-xs bg-green-50 dark:bg-green-900/10 rounded-lg px-3 py-2 text-green-700 dark:text-green-400">
                หมายเหตุงาน: {transfer.completionNote}
              </p>
            )}

            {/* Shop A actions */}
            {!isTerminal && (
              <div className="flex flex-wrap gap-2 pt-1 border-t border-indigo-100 dark:border-indigo-800/40">
                {canCancel && !confirmCancel && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-slate-600"
                    onClick={() => setConfirmCancel(true)}
                  >
                    ยกเลิกคำขอ
                  </Button>
                )}
                {canRecall && !confirmRecall && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-orange-600 border-orange-200"
                    onClick={() => setConfirmRecall(true)}
                  >
                    เรียกคืนงาน
                  </Button>
                )}
                {canOwnerRx && !confirmOwnerRx && (
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 gap-1.5"
                    onClick={() => setConfirmOwnerRx(true)}
                  >
                    <Package className="h-3 w-3" />
                    รับเครื่องคืนแล้ว
                  </Button>
                )}
              </div>
            )}

            {/* Inline confirm: cancel */}
            {confirmCancel && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/60 p-3 space-y-2">
                <p className="text-xs font-medium">ยืนยันยกเลิกคำขอโอนงาน?</p>
                <textarea
                  className="w-full text-xs p-2 rounded border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-slate-400"
                  rows={2}
                  placeholder="เหตุผล (ไม่บังคับ)"
                  value={cancelNote}
                  onChange={(e) => setCancelNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setConfirmCancel(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1 bg-slate-600 hover:bg-slate-700"
                    onClick={() => cancelMut.mutate()}
                    disabled={cancelMut.isPending}
                  >
                    {cancelMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ยืนยัน'}
                  </Button>
                </div>
              </div>
            )}

            {/* Inline confirm: recall */}
            {confirmRecall && (
              <div className="rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-50 dark:bg-orange-900/10 p-3 space-y-2">
                <p className="text-xs font-medium text-orange-700 dark:text-orange-400">ยืนยันเรียกคืนงาน?</p>
                <textarea
                  className="w-full text-xs p-2 rounded border border-orange-200 dark:border-orange-700/60 bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white resize-none focus:outline-none focus:ring-1 focus:ring-orange-400"
                  rows={2}
                  placeholder="เหตุผล (ไม่บังคับ)"
                  value={recallNote}
                  onChange={(e) => setRecallNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setConfirmRecall(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1 bg-orange-600 hover:bg-orange-700"
                    onClick={() => recallMut.mutate()}
                    disabled={recallMut.isPending}
                  >
                    {recallMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'เรียกคืน'}
                  </Button>
                </div>
              </div>
            )}

            {/* Inline confirm: owner received */}
            {confirmOwnerRx && (
              <div className="rounded-lg border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/10 p-3 space-y-2">
                <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">ยืนยันรับเครื่องคืนจากพาร์ทเนอร์?</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => setConfirmOwnerRx(false)}>
                    ยกเลิก
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs flex-1 bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => ownerRxMut.mutate()}
                    disabled={ownerRxMut.isPending}
                  >
                    {ownerRxMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'ยืนยัน'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Quotation panel — shown when transfer is in eligible state */}
        {transfer && ['DEVICE_RECEIVED', 'IN_PROGRESS', 'COMPLETED'].includes(transfer.status) && (
          <QuotationPanel
            transferId={transfer.id}
            ownerTenantId={transfer.ownerTenantId ?? ''}
            partnerTenantId={transfer.partnerTenantId}
            transferStatus={transfer.status}
          />
        )}

        {/* No transfer yet, but has partner */}
        {!transfer && hasPartner && !canSend && (
          <p className="text-xs text-muted-foreground">
            {repair.status === 'DELIVERED'
              ? 'งานส่งคืนลูกค้าแล้ว ไม่สามารถส่งพาร์ทเนอร์ได้'
              : 'ไม่สามารถส่งพาร์ทเนอร์สำหรับงานที่ยกเลิกแล้ว'}
          </p>
        )}
      </div>

      <SendToPartnerDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        repair={repair}
      />
    </>
  )
}

function Milestone({
  icon: Icon,
  color,
  label,
  date,
}: {
  icon: React.ElementType
  color: string
  label: string
  date: string | null
}) {
  if (!date) return null
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-3 w-3 ${color} shrink-0`} />
      <span className="text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-muted-foreground tabular-nums">{fmtDate(date)}</span>
    </div>
  )
}
