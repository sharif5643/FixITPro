'use client'

import { useState } from 'react'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { MoneyEquation, MoneyLine, SourceCard } from './money-parts'
import { TrailDrawer, entryRows, type Trail, type TrailRow } from '@/components/money/trail'
import type { DocRef } from '@/components/money/doc-peek'
import type { MoneyTrail } from '@/types'

/** The revenue block of /reports/daily-closing */
export interface DailyRevenue {
  pos: { total: number; gross?: number; count: number }
  repairs: { total: number; count: number; deposits?: number; atPickup?: number; debtPayments?: number }
  packages: { total: number; amount: number; count: number; byMethod?: Record<string, number> }
  otherIncome?: { total: number; count: number }
  refunds: { total: number; count: number }
  voided: { total: number; count: number }
  outstanding: { total: number; count: number }
  cash: number
  transfer: number
  card: number
}

/** Cash that left / entered the drawer outside sales and repairs (/reports/daily-closing → drawer) */
export interface DailyDrawer {
  out: { expenses: number; delivery: number; ownerDraw: number; suppliers: number; other: number }
  outTotal: number
  in: number
  /** the rows behind each line */
  items?: {
    expenses: { id: string; time: string; label: string; category: string; amount: number }[]
    moves: { id: string; time: string; direction: string; category: string | null; label: string; amount: number; shiftId: string; income: boolean; repairId?: string; ticketNumber?: string }[]
    suppliers: { id: string; time: string; amount: number; poId: string; label: string }[]
  }
}

const METHOD_NAME: Record<string, string> = { CASH: 'เงินสด', TRANSFER: 'โอน', CARD: 'บัตร' }

/** The trails behind the day's numbers (each row links to its bill, job, shift or expense) */
function dayTrails(r: DailyRevenue, t: MoneyTrail | undefined, drawer: DailyDrawer | undefined) {
  const byMethod = (m: string): TrailRow[] => [
    ...entryRows(t?.sales.filter((e) => e.method === m)).map((x) => ({ ...x, label: 'ขายของ' })),
    ...entryRows(t?.refunds.filter((e) => e.method === m), -1).map((x) => ({ ...x, label: 'คืนเงินลูกค้า' })),
    ...entryRows(t?.deposits.filter((e) => e.method === m)).map((x) => ({ ...x, label: 'มัดจำซ่อม' })),
    ...entryRows(t?.pickups.filter((e) => e.method === m)).map((x) => ({ ...x, label: 'ค่าซ่อม' })),
    ...entryRows(t?.debts.filter((e) => e.method === m)).map((x) => ({ ...x, label: 'จ่ายหนี้ค่าซ่อม' })),
    ...(t?.packages ?? []).filter((e) => e.method === m && (e.paid ?? 0) > 0).map((e) => ({ time: e.time, doc: e.ref, label: 'ซิม / เติมเงิน', amount: e.paid ?? 0 })),
    ...entryRows(t?.otherIncome.filter((e) => e.method === m)).map((x) => ({ ...x, label: 'รับเงินไม่มีบิล' })),
  ]
  const items = drawer?.items
  const shiftDoc = (id: string): DocRef => ({ kind: 'SHIFT', id, label: 'ดูกะ' })
  const moveRows = (keep: (m: NonNullable<typeof items>['moves'][number]) => boolean, sign: number): TrailRow[] =>
    (items?.moves ?? []).filter(keep).map((m) => ({
      time: m.time, label: m.label, amount: sign * m.amount,
      doc: m.repairId ? { kind: 'REPAIR', id: m.repairId, label: m.ticketNumber ?? 'งานซ่อม' } : shiftDoc(m.shiftId),
    }))
  const out = drawer?.out
  return {
    method: (m: string, expect: number): Trail => ({ title: `${METHOD_NAME[m] ?? m} — ทีละรายการ`, expect, rows: byMethod(m) }),
    sales:    { title: 'ขายของ — ทีละบิล', expect: r.pos.gross ?? r.pos.total + r.refunds.total, rows: entryRows(t?.sales) },
    refunds:  { title: 'คืนเงินลูกค้า', expect: -r.refunds.total, rows: entryRows(t?.refunds, -1) },
    posNet:   { title: 'ขายของสุทธิ', expect: r.pos.total, rows: [...entryRows(t?.sales), ...entryRows(t?.refunds, -1).map((x) => ({ ...x, label: 'คืนเงิน' }))] },
    deposits: { title: 'มัดจำ (รับเครื่อง)', expect: r.repairs.deposits ?? 0, rows: entryRows(t?.deposits) },
    pickups:  { title: 'จ่ายตอนรับเครื่องคืน', expect: r.repairs.atPickup ?? 0, rows: entryRows(t?.pickups) },
    debts:    { title: 'จ่ายหนี้ค้าง', expect: r.repairs.debtPayments ?? 0, rows: entryRows(t?.debts) },
    repairs:  { title: 'เงินค่าซ่อม — ทีละครั้ง', expect: r.repairs.total, rows: [
      ...entryRows(t?.deposits).map((x) => ({ ...x, label: 'มัดจำ' })),
      ...entryRows(t?.pickups).map((x) => ({ ...x, label: 'รับเครื่องคืน' })),
      ...entryRows(t?.debts).map((x) => ({ ...x, label: 'จ่ายหนี้' })),
    ] },
    pkgPaid:  { title: 'ซิม / เติมเงิน — รับเงินลูกค้า', expect: 0, rows: (t?.packages ?? []).map((e) => ({ time: e.time, doc: e.ref, amount: e.paid ?? e.amount, sub: e.method ? METHOD_NAME[e.method] : undefined })) },
    pkgComm:  { title: 'ค่าคอมร้าน', expect: r.packages.total, rows: (t?.packages ?? []).map((e) => ({ time: e.time, doc: e.ref, amount: e.profit ?? 0 })) },
    other:    { title: 'รับเงินไม่มีบิล', expect: r.otherIncome?.total ?? 0, rows: entryRows(t?.otherIncome).map((x) => ({ ...x, label: 'รับเงินไม่มีบิล' })) },
    dExpenses:  { title: 'ค่าใช้จ่ายที่จ่ายจากลิ้นชัก', expect: -(out?.expenses ?? 0), rows: (items?.expenses ?? []).map((e) => ({ time: e.time, doc: { kind: 'EXPENSE' as const, id: e.id, label: e.label }, sub: e.category, amount: -e.amount })) },
    dDelivery:  { title: 'ค่ารถส่งอะไหล่ (ของงานซ่อม)', expect: -(out?.delivery ?? 0), rows: moveRows((m) => m.direction === 'OUT' && m.category === 'DELIVERY', -1) },
    dOwner:     { title: 'เจ้าของเอาเงินออก', expect: -(out?.ownerDraw ?? 0), rows: moveRows((m) => m.direction === 'OUT' && m.category === 'OWNER_DRAW', -1) },
    dSuppliers: { title: 'จ่ายซัพพลายเออร์ด้วยเงินสด', expect: -(out?.suppliers ?? 0), rows: (items?.suppliers ?? []).map((p) => ({ time: p.time, doc: { kind: 'PO' as const, id: p.poId, label: p.label }, amount: -p.amount })) },
    dOther:     { title: 'เงินออกอื่นๆ', expect: -(out?.other ?? 0), rows: moveRows((m) => m.direction === 'OUT' && m.category !== 'DELIVERY' && m.category !== 'OWNER_DRAW', -1) },
    dIn:        { title: 'เงินใส่ลิ้นชัก (เงินทอน / เจ้าของเติม)', expect: drawer?.in ?? 0, rows: moveRows((m) => m.direction === 'IN' && !m.income, 1) },
  }
}

/**
 * The day's money in plain Thai: how much came in, where it should be now (drawer / bank), and
 * where it came from — with a line that adds it all up so it can be checked by hand.
 */
export function DailyMoneySummary({ r, drawer, trail, dayLabel, compact, onDetail }: {
  r: DailyRevenue
  /** cash out of / into the drawer that is not a sale: shows what should be in the drawer */
  drawer?: DailyDrawer
  /** the rows behind the numbers: with it, every number can be tapped */
  trail?: MoneyTrail
  dayLabel: string
  /** phones / SUNMI: one column */
  compact?: boolean
  onDetail?: (what: 'sales' | 'refunds' | 'repairs' | 'packages' | 'outstanding') => void
}) {
  const pkgPaid = r.packages.byMethod ? Object.values(r.packages.byMethod).reduce((a, b) => a + b, 0) : r.packages.amount
  const other = r.otherIncome?.total ?? 0
  const moneyIn = r.pos.total + r.repairs.total + pkgPaid + other
  const cash = r.cash + (r.packages.byMethod?.CASH ?? 0)
  const transfer = r.transfer + (r.packages.byMethod?.TRANSFER ?? 0)
  const card = r.card + (r.packages.byMethod?.CARD ?? 0)
  const byMethod = cash + transfer + card
  const matches = Math.abs(moneyIn - byMethod) < 1
  const sold = r.pos.gross ?? r.pos.total + r.refunds.total
  const [open, setOpen] = useState<Trail | null>(null)
  const T = trail ? dayTrails(r, trail, drawer) : null
  const go = (pick: (t: NonNullable<typeof T>) => Trail) => T ? () => setOpen(pick(T)) : undefined

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B]', !compact && 'md:grid-cols-[minmax(0,260px)_1fr]')}>
        <div>
          <p className="text-sm text-muted-foreground">{dayLabel}รับเงินเข้าร้าน</p>
          <p className="text-5xl font-extrabold tabular-nums text-blue-700 dark:text-blue-400">{formatThaiMoney(moneyIn)}</p>
          <p className="mt-1 text-sm text-muted-foreground">หักเงินที่คืนลูกค้าแล้ว</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MethodBox onClick={go((t) => t.method('CASH', cash))} icon="💵" label="เงินสด" value={cash} hint={drawer ? 'รับมาเป็นเงินสด' : 'ต้องอยู่ในลิ้นชัก (ไม่รวมเงินทอนตั้งต้น)'} tone="bg-emerald-50 dark:bg-emerald-900/20" />
          <MethodBox onClick={go((t) => t.method('TRANSFER', transfer))} icon="📱" label="โอน" value={transfer} hint="เช็คกับแอปธนาคาร" tone="bg-blue-50 dark:bg-blue-900/20" />
          <MethodBox onClick={go((t) => t.method('CARD', card))} icon="💳" label="บัตร" value={card} hint="เช็คกับสลิปเครื่องรูดบัตร" tone="bg-violet-50 dark:bg-violet-900/20" />
        </div>
      </div>

      {drawer && <DrawerCard cashIn={cash} drawer={drawer} compact={compact} go={T ? (k) => setOpen(k === 'cash' ? T.method('CASH', cash) : T[k]) : undefined} />}

      <div className={cn('grid gap-4', !compact && 'md:grid-cols-3')}>
        <SourceCard icon="🛒" title="ขายของ" onDetail={onDetail && (() => onDetail('sales'))} detailLabel="ดูบิล"
          why={r.voided.count > 0 ? `บิลที่ยกเลิก ${r.voided.count} ใบ (${formatThaiMoney(r.voided.total)}) ไม่นับ` : 'ราคาที่ขายจริงหลังส่วนลด'}>
          <MoneyLine label={`${r.pos.count} บิล`} value={sold} onClick={go((t) => t.sales)} />
          {r.refunds.total > 0 && (T
            ? <MoneyLine label={`คืนเงิน ${r.refunds.count} ครั้ง`} value={r.refunds.total} minus onClick={go((t) => t.refunds)} />
            : <MoneyLine label={<button type="button" className="text-left hover:underline" onClick={() => onDetail?.('refunds')}>คืนเงิน {r.refunds.count} ครั้ง</button>} value={r.refunds.total} minus />)}
          <MoneyLine label="สุทธิ" value={r.pos.total} total onClick={go((t) => t.posNet)} />
        </SourceCard>
        <SourceCard icon="🔧" title="งานซ่อม" onDetail={onDetail && (() => onDetail('repairs'))} detailLabel="ดูทีละงาน"
          why={r.outstanding.total > 0
            ? <>ค้างชำระอีก {formatThaiMoney(r.outstanding.total)} ({r.outstanding.count} งาน) — ยังไม่นับจนกว่าจะได้เงิน</>
            : 'นับเงินในวันที่ได้รับจริง'}>
          {(r.repairs.deposits ?? 0) > 0 && <MoneyLine label="มัดจำ (รับเครื่อง)" value={r.repairs.deposits!} onClick={go((t) => t.deposits)} />}
          {(r.repairs.atPickup ?? 0) > 0 && <MoneyLine label="จ่ายตอนรับเครื่องคืน" value={r.repairs.atPickup!} onClick={go((t) => t.pickups)} />}
          {(r.repairs.debtPayments ?? 0) > 0 && <MoneyLine label="จ่ายหนี้ค้าง" value={r.repairs.debtPayments!} onClick={go((t) => t.debts)} />}
          <MoneyLine label="รวม" value={r.repairs.total} total onClick={go((t) => t.repairs)} />
        </SourceCard>
        <SourceCard icon="📶" title="ซิม / เติมเงิน" onDetail={onDetail && r.packages.count > 0 ? () => onDetail('packages') : undefined}
          why={`เงินเข้าเต็มจำนวน แต่เป็นกำไรร้านแค่ค่าคอม ${formatThaiMoney(r.packages.total)}`}>
          <MoneyLine label={`รับเงินลูกค้า (${r.packages.count} รายการ)`} value={pkgPaid} onClick={go((t) => ({ ...t.pkgPaid, expect: pkgPaid }))} />
          <MoneyLine label="ในนี้เป็นค่าคอมร้าน" value={r.packages.total} muted onClick={go((t) => t.pkgComm)} />
          <MoneyLine label="รวม" value={pkgPaid} total />
        </SourceCard>
      </div>

      {/* Check: every part adds up to what is in the drawer and the bank */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B]">
        <span className="text-sm font-semibold">ตรวจยอด:</span>
        <MoneyEquation parts={[
          { label: 'ขายของ', value: r.pos.total, tone: 'in' },
          { label: 'ซ่อม', value: r.repairs.total, tone: 'in' },
          { label: 'ซิม', value: pkgPaid, tone: 'in' },
          ...(other > 0 ? [{ label: 'รับเงินไม่มีบิล', value: other, tone: 'in' as const, onClick: go((t) => t.other) }] : []),
          { label: 'รวม', value: moneyIn, tone: 'result' },
        ]} />
        <span className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold', matches ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-800')}>
          {matches ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          = เงินสด {formatThaiMoney(cash)} + โอน {formatThaiMoney(transfer)}{card > 0 ? ` + บัตร ${formatThaiMoney(card)}` : ''}
          {!matches && ` (ต่าง ${formatThaiMoney(Math.abs(moneyIn - byMethod))})`}
        </span>
      </div>
      <TrailDrawer trail={open} onClose={() => setOpen(null)} />
    </div>
  )
}

function MethodBox({ icon, label, value, hint, tone, onClick }: { icon: string; label: string; value: number; hint: string; tone: string; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag {...(onClick ? { type: 'button' as const, onClick } : {})} className={cn('rounded-xl px-3 py-2.5 text-left', onClick && 'ring-blue-300 transition hover:ring-2', tone)}>
      <p className="text-xs text-muted-foreground sm:text-sm">{icon} {label}</p>
      <p className="text-lg font-bold tabular-nums sm:text-2xl">{formatThaiMoney(value)}</p>
      <p className="hidden text-[11px] leading-tight text-muted-foreground sm:block">{hint}</p>
    </Tag>
  )
}

/** What should be in the drawer: cash taken in, minus what left it, written out line by line */
type DrawerKey = 'cash' | 'dIn' | 'dExpenses' | 'dDelivery' | 'dOwner' | 'dSuppliers' | 'dOther'

function DrawerCard({ cashIn, drawer, compact, go }: { cashIn: number; drawer: DailyDrawer; compact?: boolean; go?: (k: DrawerKey) => void }) {
  const shouldHave = cashIn + drawer.in - drawer.outTotal
  const outs = ([
    ['🧾 ค่าใช้จ่ายร้าน', drawer.out.expenses, 'dExpenses'],
    ['🚐 ค่ารถส่งอะไหล่ (ของงานซ่อม)', drawer.out.delivery, 'dDelivery'],
    ['👤 เจ้าของเอาออก', drawer.out.ownerDraw, 'dOwner'],
    ['📦 จ่ายซัพพลายเออร์', drawer.out.suppliers, 'dSuppliers'],
    ['↗️ เงินออกอื่นๆ', drawer.out.other, 'dOther'],
  ] as const).filter(([, v]) => v > 0)
  const tap = (k: DrawerKey) => go ? () => go(k) : undefined
  return (
    <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white shadow-sm dark:border-emerald-900 dark:from-emerald-950/40 dark:to-[#1E293B]">
      <div className={cn('grid gap-4 p-5', !compact && 'md:grid-cols-[minmax(0,260px)_1fr]')}>
        <div>
          <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">💵 ลิ้นชักควรมีเงินสด</p>
          <p className={cn('font-extrabold tabular-nums', compact ? 'text-4xl' : 'text-5xl', shouldHave < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>
            {shouldHave < 0 ? '− ' : ''}{formatThaiMoney(Math.abs(shouldHave))}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">+ เงินทอนตั้งต้นของกะ · นับเงินจริงแล้วเทียบตอนปิดกะ</p>
        </div>
        <div className="rounded-xl bg-white/80 px-4 py-2 dark:bg-slate-900/40">
          <MoneyLine label="รับเงินสดวันนี้" value={cashIn} onClick={tap('cash')} />
          {drawer.in > 0 && <MoneyLine label="เงินใส่ลิ้นชัก (เงินทอน / เจ้าของเติม)" value={drawer.in} onClick={tap('dIn')} />}
          {outs.map(([label, v, k]) => <MoneyLine key={label} label={label} value={v} minus onClick={tap(k)} />)}
          {outs.length === 0 && <p className="py-1 text-xs text-muted-foreground">วันนี้ยังไม่มีเงินออกจากลิ้นชัก</p>}
          <MoneyLine label="ควรอยู่ในลิ้นชัก" value={shouldHave} total />
        </div>
      </div>
    </div>
  )
}
