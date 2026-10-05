'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Banknote, Clock, Loader2, Search, Smartphone, X } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage, formatThaiMoney } from '@/lib/utils'

// ── Types (GET /carrier-wallet/debts, /debts/check) ───────────────────────────

export interface PackageDebt {
  id: string
  receiptNumber: string
  carrier: string
  saleType: string
  phoneNumber: string | null
  debtorName: string | null
  debtorPhone: string | null
  packageAmount: number
  creditAmount: number
  amountDue: number
  cashierName: string
  createdAt: string
  settledAt: string | null
  payments: { id: string; receiptNumber: string; amount: number; paymentMethod: string; cashierName: string; createdAt: string }[]
}

export interface OpenDebt {
  id: string; receiptNumber: string; amountDue: number; packageAmount: number
  debtorName: string | null; carrier: string; createdAt: string; phone: string
}

/** Digits only, same rule as the API: 9–15 digits or nothing. */
export function normalizePhone(raw: string): string | null {
  const d = raw.replace(/\D/g, '')
  return d.length >= 9 && d.length <= 15 ? d : null
}

function daysAgo(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))
}

/**
 * Whether this phone number still owes for an earlier SIM/package sale. A customer may owe
 * for one sale at a time, so a new credit sale is blocked while this returns a debt.
 */
export function useOpenPackageDebt(rawPhone: string, enabled = true) {
  const phone = normalizePhone(rawPhone)
  const { data, isFetching } = useQuery<OpenDebt | null>({
    queryKey: ['carrier-wallet', 'debts', 'check', phone],
    queryFn: async () => {
      const res = await api.get('/carrier-wallet/debts/check', { params: { phone } })
      return res.data && res.data.id ? res.data : null
    },
    enabled: enabled && !!phone,
    staleTime: 10_000,
  })
  return { phone, openDebt: phone ? data ?? null : null, checking: isFetching }
}

export function OpenDebtWarning({ debt }: { debt: OpenDebt }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold">
          เบอร์นี้ยังค้างจ่าย {formatThaiMoney(debt.amountDue)}{debt.debtorName ? ` (${debt.debtorName})` : ''}
        </p>
        <p className="text-xs mt-0.5">
          ใบเสร็จ {debt.receiptNumber} · {daysAgo(debt.createdAt)} วันที่แล้ว — ต้องจ่ายยอดเดิมก่อนจึงจะค้างใหม่ได้
        </p>
      </div>
    </div>
  )
}

// ── Pay dialog ────────────────────────────────────────────────────────────────

export function PayPackageDebtDialog({ debt, shiftId, cashierName, onClose, onPaid, dark = false }: {
  debt: PackageDebt; shiftId?: string; cashierName: string; onClose: () => void
  onPaid?: (result: any) => void; dark?: boolean
}) {
  const qc = useQueryClient()
  const [amount, setAmount] = useState(String(debt.amountDue))
  const [method, setMethod] = useState<'CASH' | 'TRANSFER'>('CASH')
  const num = Number(amount) || 0
  const tooMuch = num > debt.amountDue + 0.001

  const pay = useMutation({
    mutationFn: async () => (await api.post(`/carrier-wallet/debts/${debt.id}/pay`, {
      amount: Math.round(num * 100) / 100, paymentMethod: method, shiftId, cashierName,
    })).data,
    onSuccess: (res) => {
      toast.success(res.settled ? 'รับชำระครบแล้ว' : `รับชำระแล้ว เหลือค้าง ${formatThaiMoney(res.amountDue)}`)
      qc.invalidateQueries({ queryKey: ['carrier-wallet', 'debts'] })
      qc.invalidateQueries({ queryKey: ['shifts', 'current'] })
      onPaid?.(res)
      onClose()
    },
    onError: (e: any) => toast.error(apiErrorMessage(e)),
  })

  const box = dark ? 'bg-slate-800 text-white' : 'bg-white text-slate-900'
  const input = dark ? 'bg-slate-900 border-slate-700 text-white' : 'border-slate-200'
  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className={`w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl ${box}`}>
        <div className="flex items-center justify-between p-4 border-b border-black/10">
          <h3 className="font-bold">รับชำระค้างจ่าย</h3>
          <button onClick={onClose} className="opacity-60 hover:opacity-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-4 space-y-4">
          <div className="text-sm">
            <p className="font-semibold">{debt.debtorName || 'ลูกค้า'} · {debt.debtorPhone}</p>
            <p className="opacity-70">{debt.carrier} {formatThaiMoney(debt.packageAmount)} · ใบเสร็จ {debt.receiptNumber}</p>
            <p className="mt-1 text-red-500 font-bold">ค้างอยู่ {formatThaiMoney(debt.amountDue)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([['CASH', 'เงินสด', Banknote], ['TRANSFER', 'โอนเงิน', Smartphone]] as const).map(([v, label, Icon]) => (
              <button key={v} type="button" onClick={() => setMethod(v)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-semibold ${
                  method === v ? 'border-blue-600 bg-blue-600 text-white' : dark ? 'border-slate-700' : 'border-slate-200'
                }`}>
                <Icon className="h-4 w-4" />{label}
              </button>
            ))}
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-semibold">รับเงิน (บาท)</span>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              className={`w-full h-12 px-3 border-2 rounded-xl text-2xl font-bold tabular-nums ${input}`} />
            {tooMuch && <span className="text-xs text-red-500">รับเกินยอดค้างไม่ได้</span>}
            {!tooMuch && num > 0 && num < debt.amountDue && (
              <span className="text-xs opacity-70">จ่ายบางส่วน — จะเหลือค้าง {formatThaiMoney(debt.amountDue - num)}</span>
            )}
          </label>
          {!shiftId && method === 'CASH' && (
            <p className="text-xs text-amber-600">ยังไม่ได้เปิดกะ — เงินสดจะไม่เข้าลิ้นชักของกะ</p>
          )}
        </div>
        <div className="p-4 border-t border-black/10 flex gap-3">
          <button onClick={onClose} className={`flex-1 py-3 rounded-xl border font-semibold ${dark ? 'border-slate-700' : 'border-slate-200'}`}>ยกเลิก</button>
          <button
            onClick={() => pay.mutate()}
            disabled={num <= 0 || tooMuch || pay.isPending}
            className="flex-1 py-3 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {pay.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            รับชำระ {num > 0 ? formatThaiMoney(num) : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── List ──────────────────────────────────────────────────────────────────────

export function PackageDebtList({ shiftId, cashierName, dark = false }: { shiftId?: string; cashierName: string; dark?: boolean }) {
  const [status, setStatus] = useState<'open' | 'settled'>('open')
  const [q, setQ] = useState('')
  const [paying, setPaying] = useState<PackageDebt | null>(null)

  const { data: rows = [], isLoading } = useQuery<PackageDebt[]>({
    queryKey: ['carrier-wallet', 'debts', status, q.trim()],
    queryFn: async () => (await api.get('/carrier-wallet/debts', { params: { status, q: q.trim() || undefined } })).data,
    staleTime: 15_000,
  })
  const totalDue = rows.reduce((s, r) => s + r.amountDue, 0)

  const card = dark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-100 text-slate-900'
  const muted = dark ? 'text-slate-400' : 'text-slate-500'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(['open', 'settled'] as const).map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-semibold ${status === s ? 'bg-blue-600 text-white' : dark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            {s === 'open' ? 'ยังค้าง' : 'จ่ายครบแล้ว'}
          </button>
        ))}
        <div className={`flex items-center gap-2 flex-1 min-w-[180px] rounded-lg border px-3 h-9 ${dark ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'}`}>
          <Search className={`h-4 w-4 ${muted}`} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ค้นหาชื่อ / เบอร์ / เลขใบเสร็จ"
            className="flex-1 bg-transparent text-sm focus:outline-none" />
        </div>
      </div>

      {status === 'open' && rows.length > 0 && (
        <p className={`text-sm ${muted}`}>ค้างรวม <b className="text-red-500">{formatThaiMoney(totalDue)}</b> · {rows.length} ราย</p>
      )}

      {isLoading ? (
        <div className={`flex justify-center py-10 ${muted}`}><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className={`rounded-xl border py-10 text-center text-sm ${card} ${muted}`}>
          <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
          {status === 'open' ? 'ไม่มีลูกค้าค้างจ่ายซิม/แพ็กเกจ' : 'ยังไม่มีรายการที่จ่ายครบ'}
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className={`rounded-xl border p-3 flex items-center gap-3 ${card}`}>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{r.debtorName || 'ลูกค้า'} · {r.debtorPhone}</p>
                <p className={`text-xs ${muted}`}>
                  {r.carrier} {formatThaiMoney(r.packageAmount)} · {r.receiptNumber} · ขายโดย {r.cashierName}
                </p>
                <p className={`text-xs ${muted}`}>
                  {status === 'open'
                    ? `ค้างมา ${daysAgo(r.createdAt)} วัน`
                    : `จ่ายครบ ${r.settledAt ? new Date(r.settledAt).toLocaleDateString('th-TH') : ''}`}
                  {r.payments.length > 0 && ` · จ่ายแล้ว ${formatThaiMoney(r.creditAmount - r.amountDue)}`}
                </p>
              </div>
              {status === 'open' ? (
                <div className="text-right shrink-0">
                  <p className="text-red-500 font-bold tabular-nums">{formatThaiMoney(r.amountDue)}</p>
                  <button onClick={() => setPaying(r)} className="mt-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold">
                    รับชำระ
                  </button>
                </div>
              ) : (
                <p className="text-emerald-500 font-bold tabular-nums shrink-0">{formatThaiMoney(r.creditAmount)}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {paying && (
        <PayPackageDebtDialog debt={paying} shiftId={shiftId} cashierName={cashierName} dark={dark} onClose={() => setPaying(null)} />
      )}
    </div>
  )
}
