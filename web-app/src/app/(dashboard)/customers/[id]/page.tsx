'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft, Gift, Plus, Minus, RefreshCw, Wrench, ShoppingBag,
  Phone, Mail, MapPin, Tag, FileText, Clock, Printer,
} from 'lucide-react'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { SectionCard } from '@/components/ui/section-card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DataTable, DataTableHead, DataTableHeadCell, DataTableBody,
  DataTableRow, DataTableCell, DataTableEmptyRow,
} from '@/components/ui/data-table'
import api from '@/lib/api'
import { formatThaiMoney, apiErrorMessage } from '@/lib/utils'
import type { Customer } from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

interface LoyaltyTx {
  id:          string
  points:      number
  type:        string
  note?:       string
  actorName?:  string
  createdAt:   string
}

interface LoyaltyData extends Customer {
  transactions: LoyaltyTx[]
}

interface CustomerDetail extends Customer {
  _count: { sales: number; repairs: number }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TX_TYPE_LABEL: Record<string, string> = {
  EARN_MANUAL:  'เพิ่มด้วยตนเอง',
  EARN_REPAIR:  'ซ่อมครบ',
  EARN_SALE:    'ซื้อสินค้า',
  REDEEM:       'แลกรางวัล',
  ADJUST:       'ปรับยอด',
  EXPIRE:       'หมดอายุ',
}

function PointsBadge({ points }: { points: number }) {
  if (points > 0)
    return <span className="text-emerald-600 dark:text-emerald-400 font-semibold">+{points} pts</span>
  return <span className="text-red-500 dark:text-red-400 font-semibold">{points} pts</span>
}

// ─── Adjust Points Dialog ─────────────────────────────────────────────────────

function AdjustPointsDialog({
  customerId,
  currentPoints,
  open,
  onClose,
}: {
  customerId: string
  currentPoints: number
  open: boolean
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [mode, setMode]     = useState<'earn' | 'redeem'>('earn')
  const [amount, setAmount] = useState('')
  const [note, setNote]     = useState('')

  const pts = parseInt(amount) || 0

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/customers/${customerId}/loyalty/adjust`, {
        points: mode === 'earn' ? pts : -pts,
        type:   mode === 'earn' ? 'EARN_MANUAL' : 'REDEEM',
        note:   note || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-loyalty', customerId] })
      qc.invalidateQueries({ queryKey: ['customer', customerId] })
      onClose()
      setAmount(''); setNote('')
    },
    onError: (e) => alert(apiErrorMessage(e)),
  })

  const insufficient = mode === 'redeem' && pts > currentPoints

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-amber-500" /> จัดการแต้มสะสม
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            {(['earn', 'redeem'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium transition-colors
                  ${mode === m
                    ? 'bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
              >
                {m === 'earn' ? '+ เพิ่มแต้ม' : '- แลกแต้ม'}
              </button>
            ))}
          </div>

          {/* Current balance */}
          <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 p-3 flex justify-between items-center">
            <span className="text-sm text-amber-700 dark:text-amber-400">แต้มปัจจุบัน</span>
            <span className="text-lg font-bold text-amber-700 dark:text-amber-300">{currentPoints.toLocaleString()} pts</span>
          </div>

          {/* Amount input */}
          <div className="space-y-1.5">
            <Label>จำนวนแต้ม</Label>
            <Input
              type="number"
              min="1"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 text-lg"
              autoFocus
            />
            {insufficient && (
              <p className="text-xs text-red-500">แต้มไม่พอ (มี {currentPoints} pts)</p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <Label>หมายเหตุ <span className="text-slate-400">(ไม่บังคับ)</span></Label>
            <Input
              placeholder="เช่น แลกส่วนลด 50 บาท"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {/* Preview */}
          {pts > 0 && (
            <div className="text-sm text-slate-500 text-center">
              คงเหลือหลัง:{' '}
              <strong className={insufficient ? 'text-red-500' : 'text-slate-800 dark:text-slate-200'}>
                {mode === 'earn' ? currentPoints + pts : currentPoints - pts} pts
              </strong>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button
            disabled={!pts || insufficient || mutation.isPending}
            onClick={() => mutation.mutate()}
            className={mode === 'redeem' ? 'bg-rose-600 hover:bg-rose-700' : ''}
          >
            {mutation.isPending ? 'กำลังบันทึก…' : mode === 'earn' ? 'เพิ่มแต้ม' : 'แลกแต้ม'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [adjustOpen, setAdjustOpen] = useState(false)

  const { data: customer, isLoading: loadingCustomer } = useQuery<CustomerDetail>({
    queryKey: ['customer', id],
    queryFn:  async () => (await api.get(`/customers/${id}`)).data,
    staleTime: 60_000,
  })

  const { data: loyalty, isLoading: loadingLoyalty } = useQuery<LoyaltyData>({
    queryKey: ['customer-loyalty', id],
    queryFn:  async () => (await api.get(`/customers/${id}/loyalty`)).data,
    staleTime: 30_000,
  })

  if (loadingCustomer) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        <div className="h-48 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="text-center py-16 text-slate-400">
        <p>ไม่พบข้อมูลลูกค้า</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/customers')}>
          กลับไปรายการ
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* Back button + actions */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push('/customers')}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> กลับไปรายการลูกค้า
        </button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => window.open(`/print/customer-statement/${id}`, '_blank')}
        >
          <Printer className="h-4 w-4" />
          พิมพ์ Statement
        </Button>
      </div>

      {/* Customer info */}
      <SectionCard title={customer.name}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
          {customer.phone && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {customer.phone}
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {customer.email}
            </div>
          )}
          {customer.address && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 sm:col-span-2">
              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              {customer.address}
            </div>
          )}
          {customer.tags?.length > 0 && (
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 sm:col-span-2">
              <Tag className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <div className="flex flex-wrap gap-1">
                {customer.tags.map((t) => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            </div>
          )}
          {customer.note && (
            <div className="flex items-start gap-2 text-slate-500 sm:col-span-2">
              <FileText className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
              {customer.note}
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-400 text-xs sm:col-span-2">
            <Clock className="h-3 w-3" />
            ลูกค้าตั้งแต่ {format(new Date(customer.createdAt), 'd MMM yyyy', { locale: th })}
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/60">
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <ShoppingBag className="h-4 w-4" />
            <span>{customer._count?.sales ?? 0} ออเดอร์</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Wrench className="h-4 w-4" />
            <span>{customer._count?.repairs ?? 0} งานซ่อม</span>
          </div>
        </div>
      </SectionCard>

      {/* Loyalty Points */}
      <SectionCard
        title="แต้มสะสม"
        icon={Gift}
        headerAction={
          <Button size="sm" className="gap-1.5 h-8" onClick={() => setAdjustOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> จัดการแต้ม
          </Button>
        }
      >
        {/* Balance */}
        <div className="flex items-center gap-4 mb-5">
          <div className="flex flex-col items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/60 w-32 h-20">
            <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-300 tabular-nums">
              {(loyalty?.points ?? customer.points).toLocaleString()}
            </p>
            <p className="text-xs text-amber-600 dark:text-amber-500">แต้มสะสม</p>
          </div>
          <div className="text-sm text-slate-500 space-y-1">
            <p>ทุก 100 แต้ม = ส่วนลด 10 บาท</p>
            <p>แต้มไม่หมดอายุ</p>
          </div>
        </div>

        {/* Transaction history */}
        <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-2">ประวัติแต้ม</p>
        {loadingLoyalty ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableHeadCell>วันที่</DataTableHeadCell>
              <DataTableHeadCell>ประเภท</DataTableHeadCell>
              <DataTableHeadCell>หมายเหตุ</DataTableHeadCell>
              <DataTableHeadCell>โดย</DataTableHeadCell>
              <DataTableHeadCell className="text-right">แต้ม</DataTableHeadCell>
            </DataTableHead>
            <DataTableBody>
              {!loyalty?.transactions?.length ? (
                <DataTableEmptyRow message="ยังไม่มีประวัติแต้ม" colSpan={5} />
              ) : (
                loyalty.transactions.map((tx) => (
                  <DataTableRow key={tx.id}>
                    <DataTableCell className="text-xs text-slate-500 whitespace-nowrap">
                      {format(new Date(tx.createdAt), 'd MMM yy HH:mm', { locale: th })}
                    </DataTableCell>
                    <DataTableCell className="text-sm">
                      {TX_TYPE_LABEL[tx.type] ?? tx.type}
                    </DataTableCell>
                    <DataTableCell className="text-sm text-slate-500">
                      {tx.note ?? '—'}
                    </DataTableCell>
                    <DataTableCell className="text-sm text-slate-500">
                      {tx.actorName ?? '—'}
                    </DataTableCell>
                    <DataTableCell className="text-right">
                      <PointsBadge points={tx.points} />
                    </DataTableCell>
                  </DataTableRow>
                ))
              )}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      {/* Adjust dialog */}
      {adjustOpen && (
        <AdjustPointsDialog
          customerId={id}
          currentPoints={loyalty?.points ?? customer.points}
          open={adjustOpen}
          onClose={() => setAdjustOpen(false)}
        />
      )}
    </div>
  )
}
