'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Loader2, X } from 'lucide-react'
import api from '@/lib/api'
import { formatThaiMoney } from '@/lib/utils'

export interface StaffMoney {
  userId: string | null
  name: string
  cashIn: number
  otherIn: number
  cashOut: number
  otherOut: number
  netCash: number
  count: number
}

interface LedgerEntry {
  at: string
  kind: string
  ref: string
  method: string
  amount: number
  userId: string | null
  name: string
}

interface Ledger {
  id: string
  openedAt: string
  closedAt: string | null
  isActive: boolean
  openBalance: number
  openedBy: { id: string; name: string }
  staff: StaffMoney[]
  entries: LedgerEntry[]
}

const KIND: Record<string, string> = {
  SALE: 'ขาย',
  REFUND: 'คืนเงิน',
  REPAIR_PAYMENT: 'รับเงินซ่อม',
  REPAIR_DEPOSIT: 'มัดจำซ่อม',
  REPAIR_DEBT_PAYMENT: 'ชำระค่าซ่อมเพิ่ม',
  PACKAGE_SALE: 'ซิม/แพ็กเกจ',
  PACKAGE_DEBT_PAYMENT: 'ชำระค้างซิม',
  EXPENSE: 'ค่าใช้จ่าย',
  SUPPLIER_PAYMENT: 'จ่ายซัพพลายเออร์',
}
const METHOD: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร', QR: 'QR' }

/** Per person: cash they took in, other money, cash paid out, and their net cash in the drawer. */
export function StaffMoneyTable({ staff, openBalance, openedBy }: {
  staff: StaffMoney[]
  openBalance?: number
  openedBy?: string
}) {
  const totalNet = staff.reduce((s, x) => s + x.netCash, 0)
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2 text-left font-semibold">พนักงาน</th>
            <th className="px-2 py-2 text-right font-semibold">เงินสดรับ</th>
            <th className="px-2 py-2 text-right font-semibold">โอน/อื่น</th>
            <th className="px-2 py-2 text-right font-semibold">เงินสดจ่าย</th>
            <th className="px-3 py-2 text-right font-semibold">เงินสดสุทธิ</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums">
          {openBalance != null && (
            <tr className="text-slate-500">
              <td className="px-3 py-2">เงินเปิดกะ{openedBy ? ` (${openedBy})` : ''}</td>
              <td colSpan={3} />
              <td className="px-3 py-2 text-right">{formatThaiMoney(openBalance)}</td>
            </tr>
          )}
          {staff.map((x) => (
            <tr key={x.userId ?? '-'}>
              <td className="px-3 py-2 font-semibold text-slate-800">{x.name}<span className="ml-1 text-xs font-normal text-slate-400">{x.count} รายการ</span></td>
              <td className="px-2 py-2 text-right text-emerald-700">{formatThaiMoney(x.cashIn)}</td>
              <td className="px-2 py-2 text-right text-blue-700">{formatThaiMoney(x.otherIn - x.otherOut)}</td>
              <td className="px-2 py-2 text-right text-red-600">{x.cashOut ? `-${formatThaiMoney(x.cashOut)}` : '—'}</td>
              <td className="px-3 py-2 text-right font-bold text-slate-900">{formatThaiMoney(x.netCash)}</td>
            </tr>
          ))}
          {openBalance != null && (
            <tr className="bg-slate-50 font-bold">
              <td className="px-3 py-2">รวมเงินสดที่ควรมี</td>
              <td colSpan={3} />
              <td className="px-3 py-2 text-right">{formatThaiMoney(openBalance + totalNet)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/** Full-screen list of every money movement of a shift, with who did it. */
export function ShiftLedgerSheet({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery<Ledger>({
    queryKey: ['shifts', shiftId, 'ledger'],
    queryFn:  async () => (await api.get(`/shifts/${shiftId}/ledger`)).data,
    staleTime: 15_000,
  })
  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50">
      <div className="flex items-center gap-3 border-b bg-white px-4 py-3" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-900">รายการเงินในกะ — ใครรับเท่าไหร่</p>
          {data && (
            <p className="text-xs text-slate-500">
              {format(new Date(data.openedAt), 'd MMM HH:mm', { locale: th })}
              {data.closedAt ? ` – ${format(new Date(data.closedAt), 'HH:mm', { locale: th })}` : ' – ยังเปิดอยู่'}
              {' · '}เปิดโดย {data.openedBy.name}
            </p>
          )}
        </div>
        <button onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-xl border bg-white" aria-label="ปิด">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-10">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : isError || !data ? (
          <p className="py-16 text-center text-sm text-red-600">โหลดรายการไม่สำเร็จ</p>
        ) : (
          <>
            <StaffMoneyTable staff={data.staff} openBalance={data.openBalance} openedBy={data.openedBy.name} />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
              <p className="border-b px-4 py-2.5 text-sm font-bold text-slate-700">ทุกรายการ ({data.entries.length})</p>
              {data.entries.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">ยังไม่มีรายการเงินในกะนี้</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.entries.map((e, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-11 shrink-0 tabular-nums text-xs text-slate-400">{format(new Date(e.at), 'HH:mm')}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-slate-800">{KIND[e.kind] ?? e.kind} · {e.name}</p>
                        <p className="truncate text-xs text-slate-400">{e.ref} · {METHOD[e.method] ?? e.method}</p>
                      </div>
                      <span className={`shrink-0 font-bold tabular-nums ${e.amount < 0 ? 'text-red-600' : e.method === 'CASH' ? 'text-emerald-700' : 'text-blue-700'}`}>
                        {e.amount < 0 ? '-' : '+'}{formatThaiMoney(Math.abs(e.amount))}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
