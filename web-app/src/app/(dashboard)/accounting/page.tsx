'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import { BookMarked, ChevronLeft, ChevronRight, Plus, Trash2, Loader2 } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { EmptyState } from '@/components/ui/empty-state'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableLoadingRows,
} from '@/components/ui/data-table'
import { ModuleGate } from '@/components/auth/module-gate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { formatThaiMoney, apiErrorMessage } from '@/lib/utils'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AccountOption {
  id:     string
  code:   string
  nameTh: string
  type:   string
}

interface DraftLine {
  id:          number   // local key
  accountCode: string
  side:        'DR' | 'CR'
  amount:      string
  note:        string
}

// ── Manual Journal Dialog ─────────────────────────────────────────────────────

let _lineKey = 0
function newLine(): DraftLine {
  return { id: ++_lineKey, accountCode: '', side: 'DR', amount: '', note: '' }
}

function ManualJournalDialog({ open, onClose, onSuccess }: {
  open:      boolean
  onClose:   () => void
  onSuccess: () => void
}) {
  const [entryDate,   setEntryDate]   = useState(() => format(new Date(), 'yyyy-MM-dd'))
  const [description, setDescription] = useState('')
  const [lines,       setLines]       = useState<DraftLine[]>(() => [newLine(), newLine()])
  const [error,       setError]       = useState('')

  const { data: accounts = [] } = useQuery<AccountOption[]>({
    queryKey: ['accounting-accounts'],
    queryFn:  () => api.get('/accounting/accounts').then(r => r.data),
    enabled:  open,
  })

  const mutation = useMutation({
    mutationFn: (body: object) => api.post('/accounting/journals/manual', body).then(r => r.data),
    onSuccess: () => {
      onSuccess()
      onClose()
      setDescription('')
      setLines([newLine(), newLine()])
      setError('')
    },
    onError: (e: any) => setError(apiErrorMessage(e)),
  })

  const totalDR = lines.reduce((s, l) => s + (l.side === 'DR' ? parseFloat(l.amount) || 0 : 0), 0)
  const totalCR = lines.reduce((s, l) => s + (l.side === 'CR' ? parseFloat(l.amount) || 0 : 0), 0)
  const balanced = Math.abs(totalDR - totalCR) < 0.005 && totalDR > 0

  function updateLine(id: number, patch: Partial<DraftLine>) {
    setLines(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l))
  }
  function removeLine(id: number) {
    setLines(ls => ls.filter(l => l.id !== id))
  }

  function handleSubmit() {
    setError('')
    if (!description.trim()) { setError('กรุณากรอกคำอธิบายรายการ'); return }
    if (lines.length < 2)    { setError('ต้องมีอย่างน้อย 2 บรรทัด'); return }
    if (!balanced)           { setError(`เดบิต (${formatThaiMoney(totalDR)}) ≠ เครดิต (${formatThaiMoney(totalCR)})`); return }

    const apiLines = lines.map(l => ({
      accountCode: l.accountCode,
      debit:  l.side === 'DR' ? parseFloat(l.amount) || 0 : 0,
      credit: l.side === 'CR' ? parseFloat(l.amount) || 0 : 0,
      note:   l.note || undefined,
    }))

    mutation.mutate({ entryDate, description: description.trim(), lines: apiLines })
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>สร้างรายการปรับปรุงบัญชี</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">วันที่</label>
              <input
                type="date"
                value={entryDate}
                onChange={e => setEntryDate(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1 col-span-2 sm:col-span-1">
              <label className="text-xs font-medium text-muted-foreground">คำอธิบายรายการ</label>
              <Input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="เช่น ปรับปรุงค่าเสื่อมราคา เดือน สิงหาคม"
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Lines */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_80px_110px_1fr_32px] gap-2 px-1">
              <p className="text-xs font-medium text-muted-foreground">บัญชี</p>
              <p className="text-xs font-medium text-muted-foreground">Dr/Cr</p>
              <p className="text-xs font-medium text-muted-foreground text-right">จำนวน</p>
              <p className="text-xs font-medium text-muted-foreground">หมายเหตุ</p>
              <div />
            </div>

            {lines.map((line, idx) => (
              <div key={line.id} className="grid grid-cols-[1fr_80px_110px_1fr_32px] gap-2 items-center">
                <select
                  value={line.accountCode}
                  onChange={e => updateLine(line.id, { accountCode: e.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">เลือกบัญชี</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.code}>
                      {a.code} {a.nameTh}
                    </option>
                  ))}
                </select>

                <select
                  value={line.side}
                  onChange={e => updateLine(line.id, { side: e.target.value as 'DR' | 'CR' })}
                  className={`h-9 rounded-md border px-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring ${
                    line.side === 'DR'
                      ? 'border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20'
                  }`}
                >
                  <option value="DR">เดบิต</option>
                  <option value="CR">เครดิต</option>
                </select>

                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={line.amount}
                  onChange={e => updateLine(line.id, { amount: e.target.value })}
                  className="h-9 text-sm text-right tabular-nums"
                />

                <Input
                  placeholder="หมายเหตุ"
                  value={line.note}
                  onChange={e => updateLine(line.id, { note: e.target.value })}
                  className="h-9 text-sm"
                />

                <button
                  onClick={() => removeLine(line.id)}
                  disabled={lines.length <= 2}
                  className="h-8 w-8 flex items-center justify-center rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 w-full border-dashed"
              onClick={() => setLines(ls => [...ls, newLine()])}
            >
              <Plus className="h-3.5 w-3.5" />
              เพิ่มบรรทัด
            </Button>
          </div>

          {/* Balance indicator */}
          <div className={`rounded-lg px-4 py-2.5 flex items-center justify-between text-sm ${
            balanced
              ? 'bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-700/40'
              : 'bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-700/40'
          }`}>
            <span className="text-muted-foreground">เดบิต</span>
            <span className={`tabular-nums font-semibold ${balanced ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {formatThaiMoney(totalDR)}
            </span>
            <span className="text-muted-foreground mx-2">vs</span>
            <span className="text-muted-foreground">เครดิต</span>
            <span className={`tabular-nums font-semibold ${balanced ? 'text-green-700 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}>
              {formatThaiMoney(totalCR)}
            </span>
            <span className={`ml-auto text-xs font-bold ${balanced ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {balanced ? '✓ สมดุล' : 'ไม่สมดุล'}
            </span>
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="flex-1">ยกเลิก</Button>
            <Button
              className="flex-1"
              disabled={!balanced || !description.trim() || mutation.isPending}
              onClick={handleSubmit}
            >
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

interface JournalLine {
  id: string
  accountCode: string
  accountName?: string
  debit: string | number
  credit: string | number
  note?: string | null
}

interface JournalEntry {
  id: string
  entryDate: string
  description: string
  sourceType?: string | null
  sourceId?: string | null
  isVoided: boolean
  voidedAt?: string | null
  voidReason?: string | null
  totalDebit: string | number
  totalCredit?: string | number
  lines: JournalLine[]
}

interface JournalPage {
  items: JournalEntry[]
  total: number
  page: number
  limit: number
}

// ── Source type label map ─────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  REPAIR_DEPOSIT:         'มัดจำซ่อม',
  REPAIR_FINAL_PAYMENT:   'รับเงินซ่อม',
  REPAIR_DEPOSIT_SETTLE:  'หักมัดจำ',
  REPAIR_DEPOSIT_REFUND:  'คืนมัดจำ',
  REPAIR_COGS:            'ต้นทุนซ่อม',
  REPAIR_PAYMENT_REVERSAL:'ยกเลิกรับเงิน',
  REPAIR_COGS_REVERSAL:   'ยกเลิกต้นทุน',
  EXPENSE_PAYMENT:        'ค่าใช้จ่าย',
  EXPENSE_REVERSAL:       'ยกเลิกค่าใช้จ่าย',
  SALE_REVENUE:           'รายได้ขาย',
  SALE_COGS:              'ต้นทุนขาย',
  SALE_EXCHANGE:          'แลกสินค้า',
  JOURNAL_MANUAL:         'บันทึกทั่วไป',
  JOURNAL_REVERSAL:       'กลับรายการ',
}

function sourceLabel(type?: string | null) {
  if (!type) return '—'
  return SOURCE_LABEL[type] ?? type
}

// ── Journal detail row (expandable) ──────────────────────────────────────────

function JournalLinesRow({ lines }: { lines: JournalLine[] }) {
  return (
    <tr>
      <td colSpan={6} className="px-4 pb-3 pt-0">
        <div className="rounded-lg border border-slate-100 dark:border-slate-700/50 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400">
                <th className="text-left px-3 py-1.5 font-medium">บัญชี</th>
                <th className="text-right px-3 py-1.5 font-medium">เดบิต</th>
                <th className="text-right px-3 py-1.5 font-medium">เครดิต</th>
                <th className="text-left px-3 py-1.5 font-medium hidden sm:table-cell">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((ln) => (
                <tr key={ln.id} className="border-t border-slate-100 dark:border-slate-700/40">
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300 font-mono">
                    {ln.accountCode}{ln.accountName ? ` ${ln.accountName}` : ''}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-50">
                    {Number(ln.debit) > 0 ? formatThaiMoney(Number(ln.debit)) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-900 dark:text-slate-50">
                    {Number(ln.credit) > 0 ? formatThaiMoney(Number(ln.credit)) : '—'}
                  </td>
                  <td className="px-3 py-1.5 text-slate-400 dark:text-slate-500 hidden sm:table-cell">
                    {ln.note ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

function JournalListContent() {
  const queryClient = useQueryClient()
  const [viewMonth,   setViewMonth]   = useState(() => startOfMonth(new Date()))
  const [expandedId,  setExpandedId]  = useState<string | null>(null)
  const [dialogOpen,  setDialogOpen]  = useState(false)

  const startDate = format(viewMonth, 'yyyy-MM-dd')
  const endDate   = format(endOfMonth(viewMonth), 'yyyy-MM-dd')

  const { data, isLoading } = useQuery<JournalPage>({
    queryKey: ['accounting-journals', startDate, endDate],
    queryFn: () =>
      api.get('/accounting/journals', {
        params: { startDate, endDate, limit: '200' },
      }).then((r) => r.data),
  })

  const entries = data?.items ?? []

  function toggleExpand(id: string) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  function handleJournalCreated() {
    queryClient.invalidateQueries({ queryKey: ['accounting-journals'] })
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <ManualJournalDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSuccess={handleJournalCreated}
      />

      <PageHeader
        title="สมุดบัญชี"
        icon={BookMarked}
        subtitle={`${format(viewMonth, 'MMMM yyyy', { locale: th })} · ${entries.length} รายการ`}
        primaryAction={
          <Button size="sm" className="gap-1.5" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            สร้างรายการ
          </Button>
        }
      />

      {/* Month navigation */}
      <div className="flex items-center gap-1 bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700/60 rounded-lg px-1 py-1 w-fit">
        <button
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors"
        >
          <ChevronLeft className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>
        <span className="text-sm font-medium px-2 min-w-[130px] text-center text-slate-700 dark:text-slate-300">
          {format(viewMonth, 'MMMM yyyy', { locale: th })}
        </span>
        <button
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          disabled={viewMonth >= startOfMonth(new Date())}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-700/40 transition-colors disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <SectionCard noPadding>
        <DataTable>
          <DataTableHead>
            <DataTableHeadCell>วันที่</DataTableHeadCell>
            <DataTableHeadCell>ประเภท</DataTableHeadCell>
            <DataTableHeadCell>รายการ</DataTableHeadCell>
            <DataTableHeadCell right hidden>เดบิต</DataTableHeadCell>
            <DataTableHeadCell right>ยอดรวม</DataTableHeadCell>
            <DataTableHeadCell className="w-10" />
          </DataTableHead>
          <DataTableBody>
            {isLoading ? (
              <DataTableLoadingRows rows={8} cols={6} />
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-0">
                  <EmptyState
                    preset="default"
                    size="md"
                    title="ไม่มีรายการบัญชีในเดือนนี้"
                  />
                </td>
              </tr>
            ) : (
              entries.map((je) => (
                <>
                  <DataTableRow
                    key={je.id}
                    className={`cursor-pointer ${je.isVoided ? 'opacity-50' : ''}`}
                    onClick={() => toggleExpand(je.id)}
                  >
                    <DataTableCell muted>
                      <span className="text-xs whitespace-nowrap">
                        {format(new Date(je.entryDate), 'dd MMM yy', { locale: th })}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {sourceLabel(je.sourceType)}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <p className={`text-sm truncate max-w-[220px] ${je.isVoided ? 'line-through text-slate-400' : 'text-slate-900 dark:text-slate-50'}`}>
                        {je.description}
                      </p>
                      {je.isVoided && (
                        <p className="text-xs text-red-500 mt-0.5">ยกเลิก: {je.voidReason}</p>
                      )}
                    </DataTableCell>
                    <DataTableCell right hidden>
                      <span className="tabular-nums text-sm font-medium text-slate-700 dark:text-slate-300">
                        {formatThaiMoney(Number(je.totalDebit ?? 0))}
                      </span>
                    </DataTableCell>
                    <DataTableCell right>
                      <span className="tabular-nums font-bold text-slate-900 dark:text-slate-50">
                        {formatThaiMoney(Number(je.totalDebit ?? 0))}
                      </span>
                    </DataTableCell>
                    <DataTableCell>
                      <span className="text-xs text-slate-400">
                        {expandedId === je.id ? '▲' : '▼'}
                      </span>
                    </DataTableCell>
                  </DataTableRow>
                  {expandedId === je.id && je.lines?.length > 0 && (
                    <JournalLinesRow key={`${je.id}-lines`} lines={je.lines} />
                  )}
                </>
              ))
            )}
          </DataTableBody>
        </DataTable>
      </SectionCard>
    </div>
  )
}

export default function AccountingPage() {
  return (
    <ModuleGate module="accounting">
      <JournalListContent />
    </ModuleGate>
  )
}
