'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Scale, CheckCircle2, Clock, AlertTriangle,
  ArrowUpCircle, ArrowDownCircle, History,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { SectionCard } from '@/components/ui/section-card'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows, DataTableEmptyRow,
} from '@/components/ui/data-table'
import api from '@/lib/api'
import { formatThaiMoney, apiErrorMessage } from '@/lib/utils'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'OPEN' | 'PENDING_APPROVAL' | 'CLOSED'

interface Transaction {
  id: string
  type: string
  direction: 'IN' | 'OUT'
  amount: number | string
  sourceType: string
  paymentMethod?: string
  reason?: string
  createdAt: string
  actorUser: { id: string; name: string }
}

interface CurrentSession {
  id: string
  status: SessionStatus
  openedAt: string
  openingAmount: number | string
  expectedAmount: number | string
  countedAmount?: number | string
  differenceAmount?: number | string
  closingNote?: string
  differenceReason?: string
  cashDrawer: { id: string; name: string }
  openedBy: { id: string; name: string }
  participants: Array<{ joinedAt: string; user: { id: string; name: string } }>
  transactions: Transaction[]
}

interface HistorySession {
  id: string
  status: SessionStatus
  openedAt: string
  closedAt?: string
  openingAmount: number | string
  expectedAmount?: number | string
  countedAmount?: number | string
  differenceAmount?: number | string
  closingNote?: string
  differenceReason?: string
  cashDrawer: { id: string; name: string }
  openedBy: { id: string; name: string }
  closedBy?: { id: string; name: string }
  _count: { participants: number; transactions: number }
}

interface SessionHistory {
  sessions: HistorySession[]
  total: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function n(v: unknown): number {
  return parseFloat(String(v ?? '0')) || 0
}

const SOURCE_LABEL: Record<string, string> = {
  OPENING:                  'เงินเริ่มต้น',
  SALE_PAYMENT:             'ยอดขาย POS',
  SALE_REFUND:              'คืนเงินขาย',
  REPAIR_DEPOSIT:           'มัดจำซ่อม',
  REPAIR_FINAL_PAYMENT:     'รับซ่อมคืน',
  REPAIR_ADDITIONAL_PAYMENT:'รับเพิ่มเติม (ซ่อม)',
  EXPENSE_PAYMENT:          'ค่าใช้จ่าย',
  CASH_WITHDRAWAL:          'ถอนเงิน',
  CASH_DEPOSIT:             'ฝากเงิน',
  BANK_DEPOSIT:             'ฝากธนาคาร',
  REVERSAL:                 'ยกเลิกรายการ',
  MANUAL:                   'ปรับด้วยตนเอง',
}

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === 'OPEN')
    return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">เปิดอยู่</Badge>
  if (status === 'PENDING_APPROVAL')
    return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">รอตรวจสอบ</Badge>
  return <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">ปิดแล้ว</Badge>
}

function DiffBadge({ diff }: { diff: number }) {
  if (Math.abs(diff) < 0.01)
    return <span className="text-emerald-600 dark:text-emerald-400 font-semibold">ตรง ✓</span>
  return (
    <span className={diff > 0 ? 'text-blue-600 dark:text-blue-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'}>
      {diff > 0 ? '+' : ''}{formatThaiMoney(diff)}
    </span>
  )
}

// ─── Close Dialog ─────────────────────────────────────────────────────────────

function CloseSessionDialog({
  session,
  open,
  onClose,
}: {
  session: CurrentSession
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [counted, setCounted] = useState('')
  const [note, setNote]       = useState('')
  const [reason, setReason]   = useState('')

  const expected = n(session.expectedAmount)
  const countedNum = parseFloat(counted) || 0
  const diff = countedNum - expected

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/cash-drawer/session/${session.id}/close`, {
        countedAmount:   countedNum,
        closingNote:     note || undefined,
        differenceReason: Math.abs(diff) > 0.01 ? (reason || undefined) : undefined,
      }),
    onSuccess: () => {
      toast.success('ปิด session เรียบร้อย')
      qc.invalidateQueries({ queryKey: ['drawer-session-current'] })
      qc.invalidateQueries({ queryKey: ['drawer-session-history'] })
      onClose()
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="h-5 w-5" /> กระทบยอดเงินสด
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Expected */}
          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4 flex justify-between items-center">
            <span className="text-sm text-slate-500">ยอดที่ระบบคาด</span>
            <span className="text-lg font-bold">{formatThaiMoney(expected)}</span>
          </div>

          {/* Counted */}
          <div className="space-y-1.5">
            <Label>นับเงินจริงได้ (บาท)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className="text-lg h-12"
              autoFocus
            />
          </div>

          {/* Difference */}
          {counted !== '' && (
            <div className={`rounded-lg p-3 flex justify-between items-center text-sm
              ${Math.abs(diff) < 0.01
                ? 'bg-emerald-50 dark:bg-emerald-900/20'
                : diff > 0
                  ? 'bg-blue-50 dark:bg-blue-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'}`}>
              <span className="text-slate-600 dark:text-slate-400">ผลต่าง</span>
              <DiffBadge diff={diff} />
            </div>
          )}

          {/* Reason (when difference exists) */}
          {counted !== '' && Math.abs(diff) > 0.01 && (
            <div className="space-y-1.5">
              <Label>เหตุผลที่ต่าง <span className="text-slate-400">(ไม่บังคับ)</span></Label>
              <Input
                placeholder="เช่น ทอนเงินผิด, เงินนอกระบบ"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <Label>หมายเหตุ <span className="text-slate-400">(ไม่บังคับ)</span></Label>
            <Input
              placeholder="บันทึกเพิ่มเติม"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button
            disabled={!counted || mutation.isPending}
            onClick={() => mutation.mutate()}
            className={Math.abs(diff) > 0.01 ? 'bg-amber-600 hover:bg-amber-700' : ''}
          >
            {mutation.isPending ? 'กำลังปิด…' : 'ยืนยันปิด Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Transaction Breakdown ────────────────────────────────────────────────────

function TransactionBreakdown({ transactions }: { transactions: Transaction[] }) {
  // group by sourceType
  const map = new Map<string, { in: number; out: number }>()
  for (const tx of transactions) {
    const key = tx.sourceType || tx.type
    const cur = map.get(key) ?? { in: 0, out: 0 }
    if (tx.direction === 'IN') cur.in += n(tx.amount)
    else cur.out += n(tx.amount)
    map.set(key, cur)
  }

  const rows = Array.from(map.entries()).filter(([k]) => k !== 'OPENING')

  if (rows.length === 0)
    return <p className="text-sm text-slate-400 py-2">ยังไม่มีรายการ</p>

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            <th className="text-left py-2 pr-4 font-medium text-slate-500">ประเภท</th>
            <th className="text-right py-2 px-3 font-medium text-emerald-600">รับเข้า</th>
            <th className="text-right py-2 pl-3 font-medium text-red-500">จ่ายออก</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, val]) => (
            <tr key={key} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
              <td className="py-2 pr-4 text-slate-700 dark:text-slate-300">
                {SOURCE_LABEL[key] ?? key}
              </td>
              <td className="py-2 px-3 text-right font-mono">
                {val.in > 0 ? <span className="text-emerald-600">{formatThaiMoney(val.in)}</span> : <span className="text-slate-300">—</span>}
              </td>
              <td className="py-2 pl-3 text-right font-mono">
                {val.out > 0 ? <span className="text-red-500">{formatThaiMoney(val.out)}</span> : <span className="text-slate-300">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ─── Current Session Card ─────────────────────────────────────────────────────

function CurrentSessionCard({ session }: { session: CurrentSession }) {
  const qc = useQueryClient()
  const [closeOpen, setCloseOpen] = useState(false)

  const opening  = n(session.openingAmount)
  const expected = n(session.expectedAmount)
  const counted  = n(session.countedAmount)
  const diff     = n(session.differenceAmount)

  const totalIn  = session.transactions
    .filter((t) => t.direction === 'IN' && t.sourceType !== 'OPENING')
    .reduce((s, t) => s + n(t.amount), 0)
  const totalOut = session.transactions
    .filter((t) => t.direction === 'OUT')
    .reduce((s, t) => s + n(t.amount), 0)

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/cash-drawer/session/${session.id}/approve-difference`),
    onSuccess: () => {
      toast.success('อนุมัติผลต่างแล้ว')
      qc.invalidateQueries({ queryKey: ['drawer-session-current'] })
      qc.invalidateQueries({ queryKey: ['drawer-session-history'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  return (
    <>
      <SectionCard
        title={`กะปัจจุบัน — ${session.cashDrawer.name}`}
        headerAction={<StatusBadge status={session.status} />}
      >
        {/* Meta */}
        <p className="text-sm text-slate-500 mb-4">
          เปิดโดย <strong>{session.openedBy.name}</strong> ·{' '}
          {format(new Date(session.openedAt), 'd MMM yyyy HH:mm', { locale: th })}
          {session.participants.length > 1 && ` · ${session.participants.length} คน`}
        </p>

        {/* Stat grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'เงินเริ่มต้น',   value: opening,  color: 'text-slate-700 dark:text-slate-200' },
            { label: 'รับเข้า',        value: totalIn,  color: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'จ่ายออก',       value: totalOut, color: 'text-red-500 dark:text-red-400' },
            { label: 'คงเหลือที่คาด', value: expected, color: 'text-blue-600 dark:text-blue-400' },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-lg font-bold font-mono ${s.color}`}>
                {formatThaiMoney(s.value)}
              </p>
            </div>
          ))}
        </div>

        {/* Pending approval state */}
        {session.status === 'PENDING_APPROVAL' && (
          <div className="mb-5 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="font-semibold text-amber-700 dark:text-amber-400">รอตรวจสอบผลต่าง</p>
                <p className="text-sm text-amber-600 dark:text-amber-500 mt-1">
                  นับได้ <strong>{formatThaiMoney(counted)}</strong> ·
                  คาด <strong>{formatThaiMoney(expected)}</strong> ·
                  ต่าง <DiffBadge diff={diff} />
                </p>
                {session.differenceReason && (
                  <p className="text-sm text-amber-600/80 mt-1">เหตุผล: {session.differenceReason}</p>
                )}
              </div>
              <Button
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white shrink-0"
                disabled={approveMutation.isPending}
                onClick={() => approveMutation.mutate()}
              >
                อนุมัติ
              </Button>
            </div>
          </div>
        )}

        {/* Breakdown */}
        <div className="mb-5">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">รายการแยกตามประเภท</p>
          <TransactionBreakdown transactions={session.transactions} />
        </div>

        {/* Actions */}
        {session.status === 'OPEN' && (
          <div className="flex justify-end">
            <Button onClick={() => setCloseOpen(true)} className="gap-2">
              <Scale className="h-4 w-4" /> กระทบยอดและปิด Session
            </Button>
          </div>
        )}
      </SectionCard>

      {closeOpen && (
        <CloseSessionDialog
          session={session}
          open={closeOpen}
          onClose={() => setCloseOpen(false)}
        />
      )}
    </>
  )
}

// ─── History Table ─────────────────────────────────────────────────────────────

function HistoryTable() {
  const [page, setPage] = useState(1)
  const limit = 15

  const { data, isLoading } = useQuery<SessionHistory>({
    queryKey: ['drawer-session-history', page],
    queryFn: async () => {
      const res = await api.get('/cash-drawer/session/history', { params: { page, limit } })
      return res.data
    },
    staleTime: 30_000,
  })

  const sessions = data?.sessions ?? []
  const total    = data?.total ?? 0
  const pages    = Math.ceil(total / limit)

  return (
    <SectionCard title="ประวัติ Session" icon={History}>
      <DataTable>
        <DataTableHead>
          <DataTableHeadCell>วันที่เปิด</DataTableHeadCell>
          <DataTableHeadCell>ลิ้นชัก</DataTableHeadCell>
          <DataTableHeadCell>เปิดโดย</DataTableHeadCell>
          <DataTableHeadCell className="text-right">เริ่มต้น</DataTableHeadCell>
          <DataTableHeadCell className="text-right">คาด</DataTableHeadCell>
          <DataTableHeadCell className="text-right">นับได้</DataTableHeadCell>
          <DataTableHeadCell className="text-right">ผลต่าง</DataTableHeadCell>
          <DataTableHeadCell>สถานะ</DataTableHeadCell>
        </DataTableHead>
        <DataTableBody>
          {isLoading ? (
            <DataTableLoadingRows cols={8} />
          ) : sessions.length === 0 ? (
            <DataTableEmptyRow message="ยังไม่มีประวัติ Session" colSpan={8} />
          ) : (
            sessions.map((s) => {
              const diff = n(s.differenceAmount)
              return (
                <DataTableRow key={s.id}>
                  <DataTableCell className="text-sm">
                    {format(new Date(s.openedAt), 'd MMM yy HH:mm', { locale: th })}
                  </DataTableCell>
                  <DataTableCell className="text-sm">{s.cashDrawer.name}</DataTableCell>
                  <DataTableCell className="text-sm">{s.openedBy.name}</DataTableCell>
                  <DataTableCell className="text-right font-mono text-sm">
                    {formatThaiMoney(n(s.openingAmount))}
                  </DataTableCell>
                  <DataTableCell className="text-right font-mono text-sm">
                    {s.expectedAmount != null ? formatThaiMoney(n(s.expectedAmount)) : '—'}
                  </DataTableCell>
                  <DataTableCell className="text-right font-mono text-sm">
                    {s.countedAmount != null ? formatThaiMoney(n(s.countedAmount)) : '—'}
                  </DataTableCell>
                  <DataTableCell className="text-right text-sm">
                    {s.countedAmount != null ? <DiffBadge diff={diff} /> : '—'}
                  </DataTableCell>
                  <DataTableCell><StatusBadge status={s.status} /></DataTableCell>
                </DataTableRow>
              )
            })
          )}
        </DataTableBody>
      </DataTable>

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-slate-500">
          <span>ทั้งหมด {total} รายการ</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>ก่อนหน้า</Button>
            <span className="flex items-center px-2">{page} / {pages}</span>
            <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>ถัดไป</Button>
          </div>
        </div>
      )}
    </SectionCard>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ReconciliationPage() {
  const { data: session, isLoading } = useQuery<CurrentSession | null>({
    queryKey: ['drawer-session-current'],
    queryFn: async () => {
      try {
        const res = await api.get('/cash-drawer/session/current')
        return res.data ?? null
      } catch {
        return null
      }
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Scale className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">กระทบยอดเงินสด</h1>
          <p className="text-sm text-slate-500">ตรวจสอบยอดเงินในลิ้นชักกับระบบ</p>
        </div>
      </div>

      {/* Current session */}
      {isLoading ? (
        <SectionCard title="กำลังโหลด…">
          <div className="h-40 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-lg" />
        </SectionCard>
      ) : session ? (
        <CurrentSessionCard session={session} />
      ) : (
        <SectionCard title="Session ปัจจุบัน">
          <div className="flex flex-col items-center gap-3 py-10 text-slate-400">
            <Clock className="h-10 w-10" />
            <p className="font-medium">ไม่มี Session ที่เปิดอยู่</p>
            <p className="text-sm">เปิดกะก่อน ระบบจะสร้าง Cash Drawer Session ให้อัตโนมัติ</p>
          </div>
        </SectionCard>
      )}

      {/* History */}
      <HistoryTable />
    </div>
  )
}
