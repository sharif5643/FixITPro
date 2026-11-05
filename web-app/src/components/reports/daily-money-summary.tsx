'use client'

import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn, formatThaiMoney } from '@/lib/utils'
import { MoneyEquation, MoneyLine, SourceCard } from './money-parts'

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
}

/**
 * The day's money in plain Thai: how much came in, where it should be now (drawer / bank), and
 * where it came from — with a line that adds it all up so it can be checked by hand.
 */
export function DailyMoneySummary({ r, drawer, dayLabel, compact, onDetail }: {
  r: DailyRevenue
  /** cash out of / into the drawer that is not a sale: shows what should be in the drawer */
  drawer?: DailyDrawer
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

  return (
    <div className="space-y-4">
      <div className={cn('grid gap-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-[#1E293B]', !compact && 'md:grid-cols-[minmax(0,260px)_1fr]')}>
        <div>
          <p className="text-sm text-muted-foreground">{dayLabel}รับเงินเข้าร้าน</p>
          <p className="text-5xl font-extrabold tabular-nums text-blue-700 dark:text-blue-400">{formatThaiMoney(moneyIn)}</p>
          <p className="mt-1 text-sm text-muted-foreground">หักเงินที่คืนลูกค้าแล้ว</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <MethodBox icon="💵" label="เงินสด" value={cash} hint={drawer ? 'รับมาเป็นเงินสด' : 'ต้องอยู่ในลิ้นชัก (ไม่รวมเงินทอนตั้งต้น)'} tone="bg-emerald-50 dark:bg-emerald-900/20" />
          <MethodBox icon="📱" label="โอน" value={transfer} hint="เช็คกับแอปธนาคาร" tone="bg-blue-50 dark:bg-blue-900/20" />
          <MethodBox icon="💳" label="บัตร" value={card} hint="เช็คกับสลิปเครื่องรูดบัตร" tone="bg-violet-50 dark:bg-violet-900/20" />
        </div>
      </div>

      {drawer && <DrawerCard cashIn={cash} drawer={drawer} compact={compact} />}

      <div className={cn('grid gap-4', !compact && 'md:grid-cols-3')}>
        <SourceCard icon="🛒" title="ขายของ" onDetail={onDetail && (() => onDetail('sales'))} detailLabel="ดูบิล"
          why={r.voided.count > 0 ? `บิลที่ยกเลิก ${r.voided.count} ใบ (${formatThaiMoney(r.voided.total)}) ไม่นับ` : 'ราคาที่ขายจริงหลังส่วนลด'}>
          <MoneyLine label={`${r.pos.count} บิล`} value={sold} />
          {r.refunds.total > 0 && <MoneyLine label={<button type="button" className="text-left hover:underline" onClick={() => onDetail?.('refunds')}>คืนเงิน {r.refunds.count} ครั้ง</button>} value={r.refunds.total} minus />}
          <MoneyLine label="สุทธิ" value={r.pos.total} total />
        </SourceCard>
        <SourceCard icon="🔧" title="งานซ่อม" onDetail={onDetail && (() => onDetail('repairs'))} detailLabel="ดูทีละงาน"
          why={r.outstanding.total > 0
            ? <>ค้างชำระอีก {formatThaiMoney(r.outstanding.total)} ({r.outstanding.count} งาน) — ยังไม่นับจนกว่าจะได้เงิน</>
            : 'นับเงินในวันที่ได้รับจริง'}>
          {(r.repairs.deposits ?? 0) > 0 && <MoneyLine label="มัดจำ (รับเครื่อง)" value={r.repairs.deposits!} />}
          {(r.repairs.atPickup ?? 0) > 0 && <MoneyLine label="จ่ายตอนรับเครื่องคืน" value={r.repairs.atPickup!} />}
          {(r.repairs.debtPayments ?? 0) > 0 && <MoneyLine label="จ่ายหนี้ค้าง" value={r.repairs.debtPayments!} />}
          <MoneyLine label="รวม" value={r.repairs.total} total />
        </SourceCard>
        <SourceCard icon="📶" title="ซิม / เติมเงิน" onDetail={onDetail && r.packages.count > 0 ? () => onDetail('packages') : undefined}
          why={`เงินเข้าเต็มจำนวน แต่เป็นกำไรร้านแค่ค่าคอม ${formatThaiMoney(r.packages.total)}`}>
          <MoneyLine label={`รับเงินลูกค้า (${r.packages.count} รายการ)`} value={pkgPaid} />
          <MoneyLine label="ในนี้เป็นค่าคอมร้าน" value={r.packages.total} muted />
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
          ...(other > 0 ? [{ label: 'รับเงินไม่มีบิล', value: other, tone: 'in' as const }] : []),
          { label: 'รวม', value: moneyIn, tone: 'result' },
        ]} />
        <span className={cn('flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-bold', matches ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-800')}>
          {matches ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          = เงินสด {formatThaiMoney(cash)} + โอน {formatThaiMoney(transfer)}{card > 0 ? ` + บัตร ${formatThaiMoney(card)}` : ''}
          {!matches && ` (ต่าง ${formatThaiMoney(Math.abs(moneyIn - byMethod))})`}
        </span>
      </div>
    </div>
  )
}

function MethodBox({ icon, label, value, hint, tone }: { icon: string; label: string; value: number; hint: string; tone: string }) {
  return (
    <div className={cn('rounded-xl px-3 py-2.5', tone)}>
      <p className="text-xs text-muted-foreground sm:text-sm">{icon} {label}</p>
      <p className="text-lg font-bold tabular-nums sm:text-2xl">{formatThaiMoney(value)}</p>
      <p className="hidden text-[11px] leading-tight text-muted-foreground sm:block">{hint}</p>
    </div>
  )
}

/** What should be in the drawer: cash taken in, minus what left it, written out line by line */
function DrawerCard({ cashIn, drawer, compact }: { cashIn: number; drawer: DailyDrawer; compact?: boolean }) {
  const shouldHave = cashIn + drawer.in - drawer.outTotal
  const outs = ([
    ['🧾 ค่าใช้จ่ายร้าน', drawer.out.expenses],
    ['🚐 ค่ารถส่งอะไหล่ (ของงานซ่อม)', drawer.out.delivery],
    ['👤 เจ้าของเอาออก', drawer.out.ownerDraw],
    ['📦 จ่ายซัพพลายเออร์', drawer.out.suppliers],
    ['↗️ เงินออกอื่นๆ', drawer.out.other],
  ] as const).filter(([, v]) => v > 0)
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
          <MoneyLine label="รับเงินสดวันนี้" value={cashIn} />
          {drawer.in > 0 && <MoneyLine label="เงินใส่ลิ้นชัก (เงินทอน / เจ้าของเติม)" value={drawer.in} />}
          {outs.map(([label, v]) => <MoneyLine key={label} label={label} value={v} minus />)}
          {outs.length === 0 && <p className="py-1 text-xs text-muted-foreground">วันนี้ยังไม่มีเงินออกจากลิ้นชัก</p>}
          <MoneyLine label="ควรอยู่ในลิ้นชัก" value={shouldHave} total />
        </div>
      </div>
    </div>
  )
}
