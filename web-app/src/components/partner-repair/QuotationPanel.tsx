'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { DollarSign, ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import {
  getQuotations,
  getActiveQuotation,
  createQuotation,
  acceptQuotation,
  rejectQuotation,
  counterQuotation,
  QUOTATION_STATUS_LABEL,
  isQuotationTerminal,
  type PartnerRepairQuotation,
  type QuotationStatus,
} from '@/lib/partner-repair-quotations'

interface Props {
  transferId:      string
  ownerTenantId:   string
  partnerTenantId: string
  transferStatus:  string
}

const STATUS_COLOR: Record<QuotationStatus, string> = {
  PENDING:       'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
  ACCEPTED:      'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400',
  REJECTED:      'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  COUNTER_OFFER: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  EXPIRED:       'bg-slate-100 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400',
  CANCELLED:     'bg-slate-100 dark:bg-slate-700/40 text-slate-500 dark:text-slate-400',
}

function fmtDate(d?: string | null) {
  if (!d) return null
  try { return format(new Date(d), 'dd MMM yy HH:mm', { locale: th }) } catch { return d }
}

function fmtAmount(v: string | number | null | undefined) {
  if (v == null) return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  return isNaN(n) ? String(v) : n.toLocaleString('th-TH', { minimumFractionDigits: 0 })
}

// ── Propose-price form ────────────────────────────────────────────────────────

function ProposeForm({
  onSubmit,
  isPending,
  label,
}: {
  onSubmit: (amount: number, note?: string) => void
  isPending: boolean
  label: string
}) {
  const [amount, setAmount] = useState('')
  const [note, setNote]     = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const n = parseFloat(amount)
    if (!amount || isNaN(n) || n <= 0) {
      toast.error('กรุณาระบุจำนวนเงินที่ถูกต้อง (มากกว่า 0)')
      return
    }
    onSubmit(n, note.trim() || undefined)
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <div className="flex gap-2 items-center">
        <span className="text-sm text-muted-foreground">ราคา (บาท)</span>
        <input
          type="number"
          min="1"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="w-32 border rounded px-2 py-1 text-sm"
          data-testid="quotation-amount-input"
        />
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="หมายเหตุ (ไม่บังคับ)"
        className="w-full border rounded px-2 py-1 text-sm"
        rows={2}
      />
      <Button type="submit" disabled={isPending} size="sm">
        {isPending ? 'กำลังส่ง...' : label}
      </Button>
    </form>
  )
}

// ── Reject / counter form ─────────────────────────────────────────────────────

function RejectForm({
  onReject,
  isPending,
}: {
  onReject: (note?: string) => void
  isPending: boolean
}) {
  const [note, setNote] = useState('')
  return (
    <div className="space-y-2">
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="เหตุผลที่ปฏิเสธ (ไม่บังคับ)"
        className="w-full border rounded px-2 py-1 text-sm"
        rows={2}
      />
      <Button
        variant="destructive"
        size="sm"
        disabled={isPending}
        onClick={() => onReject(note.trim() || undefined)}
      >
        {isPending ? 'กำลังส่ง...' : 'ปฏิเสธราคา'}
      </Button>
    </div>
  )
}

// ── Quotation history list ────────────────────────────────────────────────────

function QuotationHistory({
  quotations,
  myTenantId,
}: {
  quotations: PartnerRepairQuotation[]
  myTenantId: string
}) {
  const [expanded, setExpanded] = useState(false)
  if (quotations.length === 0) return null

  const visible = expanded ? quotations : quotations.slice(-2)

  return (
    <div className="mt-3 space-y-1">
      <button
        className="text-xs text-muted-foreground underline"
        onClick={() => setExpanded(!expanded)}
        type="button"
      >
        {expanded ? (
          <span className="flex items-center gap-1"><ChevronUp className="w-3 h-3" />ซ่อนประวัติ</span>
        ) : (
          <span className="flex items-center gap-1"><ChevronDown className="w-3 h-3" />ดูประวัติทั้งหมด ({quotations.length} รายการ)</span>
        )}
      </button>
      {visible.map((q) => {
        const isMine = q.proposedByTenantId === myTenantId
        return (
          <div
            key={q.id}
            className={`rounded px-2 py-1 text-xs flex items-center justify-between ${
              isMine ? 'bg-muted/40' : 'bg-primary/5'
            }`}
          >
            <span>
              v{q.version} {isMine ? '(คุณเสนอ)' : '(พาร์ทเนอร์เสนอ)'}
              {' — '}
              {fmtAmount(q.proposedAmount)} บาท
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_COLOR[q.status]}`}>
              {QUOTATION_STATUS_LABEL[q.status]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export function QuotationPanel({ transferId, ownerTenantId, partnerTenantId, transferStatus }: Props) {
  const queryClient  = useQueryClient()
  const { user }     = useAuthStore()
  const myTenantId   = user?.tenantId ?? ''
  const isOwner      = myTenantId === ownerTenantId
  const isPartner    = myTenantId === partnerTenantId

  // Shop B is partner; Shop A is owner
  const [mode, setMode] = useState<'idle' | 'propose' | 'counter' | 'reject'>('idle')

  const { data: activeQuotation, isLoading: loadingActive } = useQuery({
    queryKey: ['quotation-active', transferId],
    queryFn:  () => getActiveQuotation(transferId),
    staleTime: 10_000,
    enabled:  !!transferId,
  })

  const { data: allQuotations = [] } = useQuery({
    queryKey: ['quotations-history', transferId],
    queryFn:  () => getQuotations(transferId),
    staleTime: 30_000,
    enabled:  !!transferId,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['quotation-active', transferId] })
    queryClient.invalidateQueries({ queryKey: ['quotations-history', transferId] })
    queryClient.invalidateQueries({ queryKey: ['partner-transfer'] })
  }

  const createMut = useMutation({
    mutationFn: (p: { amount: number; note?: string }) => createQuotation(transferId, p),
    onSuccess: () => { invalidate(); setMode('idle'); toast.success('ส่งใบเสนอราคาแล้ว') },
    onError:   (err: any) => toast.error(apiErrorMessage(err)),
  })

  const acceptMut = useMutation({
    mutationFn: () => acceptQuotation(activeQuotation!.id),
    onSuccess: () => { invalidate(); toast.success('ยืนยันราคาแล้ว') },
    onError:   (err: any) => toast.error(apiErrorMessage(err)),
  })

  const rejectMut = useMutation({
    mutationFn: (note?: string) => rejectQuotation(activeQuotation!.id, note),
    onSuccess: () => { invalidate(); setMode('idle'); toast.success('ปฏิเสธราคาแล้ว') },
    onError:   (err: any) => toast.error(apiErrorMessage(err)),
  })

  const counterMut = useMutation({
    mutationFn: (p: { amount: number; note?: string }) => counterQuotation(activeQuotation!.id, p),
    onSuccess: () => { invalidate(); setMode('idle'); toast.success('เสนอราคาตอบกลับแล้ว') },
    onError:   (err: any) => toast.error(apiErrorMessage(err)),
  })

  // Only show panel if this transfer is in a quotation-eligible state
  const isQuotationEligible = ['DEVICE_RECEIVED', 'IN_PROGRESS', 'COMPLETED'].includes(transferStatus)
  if (!isPartner && !isOwner) return null

  const active = activeQuotation
  const hasActive = !!active
  const iAmProposer = active?.proposedByTenantId === myTenantId
  const iCanRespond  = hasActive && !iAmProposer

  const canPropose = isPartner && !hasActive && isQuotationEligible
  const lastAccepted = allQuotations.find((q) => q.status === 'ACCEPTED')

  return (
    <div className="border rounded-lg p-4 mt-4 space-y-3 bg-background">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <DollarSign className="w-4 h-4" />
        การเจรจาราคาพาร์ทเนอร์
      </div>

      {/* Agreed price banner */}
      {lastAccepted && (
        <div className="rounded bg-emerald-50 dark:bg-emerald-900/20 px-3 py-2 text-sm">
          ราคาที่ตกลงกัน:{' '}
          <strong>{fmtAmount(lastAccepted.proposedAmount)} บาท</strong>
          {lastAccepted.note && <span className="ml-2 text-muted-foreground">({lastAccepted.note})</span>}
        </div>
      )}

      {/* Active quotation card */}
      {loadingActive && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}

      {!loadingActive && active && (
        <div className="rounded border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              ใบเสนอราคา v{active.version}
              {active.proposedByTenantId === myTenantId ? ' (คุณเสนอ)' : ' (พาร์ทเนอร์เสนอ)'}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[active.status]}`}>
              {QUOTATION_STATUS_LABEL[active.status]}
            </span>
          </div>
          <div className="text-xl font-bold">
            {fmtAmount(active.proposedAmount)} <span className="text-sm font-normal">บาท</span>
          </div>
          {active.note && <p className="text-xs text-muted-foreground">{active.note}</p>}
          <p className="text-xs text-muted-foreground">{fmtDate(active.createdAt)}</p>

          {/* Responder actions (other side) */}
          {iCanRespond && mode === 'idle' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => acceptMut.mutate()}
                disabled={acceptMut.isPending}
                data-testid="accept-quotation-btn"
              >
                {acceptMut.isPending ? 'กำลังยืนยัน...' : 'ยืนยันราคา'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setMode('counter')}
                data-testid="counter-quotation-btn"
              >
                เสนอราคาตอบกลับ
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMode('reject')}
                data-testid="reject-quotation-btn"
              >
                ปฏิเสธ
              </Button>
            </div>
          )}

          {mode === 'counter' && iCanRespond && (
            <div className="pt-1">
              <p className="text-xs font-medium mb-1">เสนอราคาใหม่:</p>
              <ProposeForm
                label="ส่งราคาตอบกลับ"
                isPending={counterMut.isPending}
                onSubmit={(amount, note) => counterMut.mutate({ amount, note })}
              />
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>ยกเลิก</Button>
            </div>
          )}

          {mode === 'reject' && iCanRespond && (
            <div className="pt-1">
              <RejectForm
                onReject={(note) => rejectMut.mutate(note)}
                isPending={rejectMut.isPending}
              />
              <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>ยกเลิก</Button>
            </div>
          )}
        </div>
      )}

      {/* No active quotation + Shop B can propose */}
      {!loadingActive && !active && canPropose && mode === 'idle' && (
        <div>
          <p className="text-xs text-muted-foreground mb-2">ยังไม่มีการเสนอราคา</p>
          <Button size="sm" onClick={() => setMode('propose')} data-testid="propose-quotation-btn">
            เสนอราคา
          </Button>
        </div>
      )}

      {mode === 'propose' && canPropose && (
        <div>
          <p className="text-xs font-medium mb-1">เสนอราคาซ่อม:</p>
          <ProposeForm
            label="ส่งใบเสนอราคา"
            isPending={createMut.isPending}
            onSubmit={(amount, note) => createMut.mutate({ amount, note })}
          />
          <Button size="sm" variant="ghost" onClick={() => setMode('idle')}>ยกเลิก</Button>
        </div>
      )}

      {/* Quotation history */}
      <QuotationHistory quotations={allQuotations} myTenantId={myTenantId} />
    </div>
  )
}
