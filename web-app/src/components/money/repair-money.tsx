'use client'

import { MoneyLine } from '@/components/reports/money-parts'
import { formatThaiMoney } from '@/lib/utils'

/** GET /repairs/:id/profit */
export interface RepairMoney {
  repairId: string
  ticketNumber: string
  revenue: { deposit: number; finalPayment: number; additionalPayments: number; reversals: number; total: number }
  costs: {
    parts: number; total: number; delivery?: number; labor?: number
    partList?: { name: string; qty: number; cost: number; isFreebie?: boolean }[]
    extraList?: { id: string; kind: string; amount: number; note?: string | null; fromDrawer: boolean }[]
  }
  grossProfit: number
  marginPercent: number
}

/** Where one repair job's money came from and went: money in, each cost, what is left */
export function RepairMoneyBox({ m }: { m: RepairMoney }) {
  const r = m.revenue
  const c = m.costs
  return (
    <div className="space-y-0.5">
      {r.deposit > 0 && <MoneyLine label="มัดจำตอนรับเครื่อง" value={r.deposit} />}
      {r.finalPayment > 0 && <MoneyLine label="จ่ายตอนรับเครื่องคืน" value={r.finalPayment} />}
      {r.additionalPayments > 0 && <MoneyLine label="จ่ายเพิ่ม / จ่ายหนี้ค้าง" value={r.additionalPayments} />}
      {r.reversals > 0 && <MoneyLine label="คืนเงินลูกค้า" value={r.reversals} minus />}
      <MoneyLine label="รับเงินรวม" value={r.total} />
      {(c.partList ?? []).length > 0
        ? c.partList!.map((p, i) => (
            <MoneyLine key={i} label={`${p.isFreebie ? '🎁 ' : '🔩 '}${p.name} × ${p.qty}${p.isFreebie ? ' (แถม)' : ''}`} value={p.cost} minus />
          ))
        : c.parts > 0 && <MoneyLine label="ต้นทุนอะไหล่" value={c.parts} minus />}
      {(c.extraList ?? []).map((x) => (
        <MoneyLine key={x.id} label={`🚐 ค่ารถส่งอะไหล่${x.note ? ` (${x.note})` : ''}`} value={x.amount} minus
          note={x.fromDrawer ? 'จ่ายจากลิ้นชัก' : 'เจ้าของจ่ายเอง'} />
      ))}
      {(c.labor ?? 0) > 0 && <MoneyLine label="🧑‍🔧 ค่าแรงช่าง" value={c.labor!} minus />}
      <MoneyLine label={m.grossProfit >= 0 ? `กำไรงานนี้ (${m.marginPercent.toFixed(0)}%)` : 'ขาดทุนงานนี้'} value={m.grossProfit} total />
      {r.total === 0 && <p className="pt-1 text-xs text-muted-foreground">ยังไม่ได้รับเงิน — {formatThaiMoney(c.total)} คือต้นทุนที่ใช้ไปแล้ว</p>}
    </div>
  )
}
