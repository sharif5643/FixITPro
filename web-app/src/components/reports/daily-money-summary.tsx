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

/**
 * The day's money in plain Thai: how much came in, where it should be now (drawer / bank), and
 * where it came from — with a line that adds it all up so it can be checked by hand.
 */
export function DailyMoneySummary({ r, dayLabel, compact, onDetail }: {
  r: DailyRevenue
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
          <MethodBox icon="💵" label="เงินสด" value={cash} hint="ต้องอยู่ในลิ้นชัก (ไม่รวมเงินทอนตั้งต้น)" tone="bg-emerald-50 dark:bg-emerald-900/20" />
          <MethodBox icon="📱" label="โอน" value={transfer} hint="เช็คกับแอปธนาคาร" tone="bg-blue-50 dark:bg-blue-900/20" />
          <MethodBox icon="💳" label="บัตร" value={card} hint="เช็คกับสลิปเครื่องรูดบัตร" tone="bg-violet-50 dark:bg-violet-900/20" />
        </div>
      </div>

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
