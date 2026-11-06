/**
 * The owner hub's numbers in the shape the page and the LINE message both use, and the LINE
 * message itself. Kept apart from the service so the wording can be tested without a database.
 */

export interface BranchMoney {
  branchId: string | null
  name: string
  /** what the shop earned today: bills, repair money, SIM commission, other income, less refunds */
  revenue: number
  cash: number
  transfer: number
  card: number
  /** cash that left the drawer that is not a refund (expenses, supplier payments, cash out) */
  drawerOut: number
  expenses: number
  netProfit: number
  bills: number
  repairPayments: number
}

export interface ActionItems {
  longShifts: { id: string; userName: string; branchName: string | null; hours: number }[]
  overdueRepairs: { count: number; items: { id: string; ticketNumber: string; customer: string | null; device: string; dueDate: string }[] }
  waitingPickup: { count: number; items: { id: string; ticketNumber: string; customer: string | null; device: string; days: number }[] }
  customerDebt: { count: number; total: number }
  supplierDue: { count: number; total: number; overdue: number; items: { id: string; poNumber: string; supplier: string; dueDate: string; remaining: number; overdue: boolean }[] }
  stock: { outOfStock: number; lowStock: number }
}

export interface OwnerToday {
  date: string
  total: BranchMoney
  /** one row per branch, only when the shop has more than one */
  branches: BranchMoney[]
  actions: ActionItems
}

const baht = (n: number) => Math.round(n).toLocaleString('en-US')

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** "พฤ. 6 พ.ย." for 2026-11-06 */
export function thaiDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  return `${TH_DAYS[dow]} ${d} ${TH_MONTHS[m - 1]}`
}

/** How many topics wait for the owner — the same count as the page's "ต้องจัดการ N เรื่อง" */
export function actionCount(a: ActionItems): number {
  return (
    (a.longShifts.length > 0 ? 1 : 0) +
    (a.overdueRepairs.count > 0 ? 1 : 0) +
    (a.waitingPickup.count > 0 ? 1 : 0) +
    (a.customerDebt.count > 0 ? 1 : 0) +
    (a.supplierDue.count > 0 ? 1 : 0) +
    (a.stock.outOfStock + a.stock.lowStock > 0 ? 1 : 0)
  )
}

/** The lines under "ต้องจัดการ", in the order the owner should look at them */
export function actionLines(a: ActionItems): string[] {
  const out: string[] = []
  for (const s of a.longShifts) {
    out.push(`กะของ ${s.userName}${s.branchName ? ` (${s.branchName})` : ''} เปิดค้าง ${s.hours} ชม. ยังไม่ปิด`)
  }
  if (a.supplierDue.overdue > 0) out.push(`ใบสั่งซื้อเลยกำหนดจ่าย ${a.supplierDue.overdue} ใบ`)
  if (a.supplierDue.count - a.supplierDue.overdue > 0) out.push(`ใบสั่งซื้อครบกำหนดจ่ายใน 3 วัน ${a.supplierDue.count - a.supplierDue.overdue} ใบ`)
  if (a.overdueRepairs.count > 0) out.push(`งานซ่อมเลยวันนัด ${a.overdueRepairs.count} งาน`)
  if (a.waitingPickup.count > 0) out.push(`ซ่อมเสร็จแล้วลูกค้ายังไม่มารับเกิน 7 วัน ${a.waitingPickup.count} เครื่อง`)
  if (a.customerDebt.count > 0) out.push(`ลูกค้าค้างจ่ายค่าซ่อม ${a.customerDebt.count} งาน รวม ${baht(a.customerDebt.total)} บาท`)
  if (a.stock.outOfStock > 0) out.push(`สินค้าหมด ${a.stock.outOfStock} รายการ`)
  if (a.stock.lowStock > 0) out.push(`สินค้าใกล้หมด ${a.stock.lowStock} รายการ`)
  return out
}

/** The evening message to the owner's LINE */
export function summaryText(t: OwnerToday, shopName: string, origin: string): string {
  const m = t.total
  const lines: string[] = [
    `📊 ${shopName} · ${thaiDayLabel(t.date)}`,
    '',
    `💰 รายรับวันนี้ ${baht(m.revenue)} บาท`,
    `   เงินสด ${baht(m.cash)} · โอน/QR ${baht(m.transfer)}${m.card ? ` · บัตร ${baht(m.card)}` : ''}`,
    `🧾 บิลขาย ${m.bills} ใบ · รับเงินงานซ่อม ${m.repairPayments} งาน`,
  ]
  if (m.drawerOut > 0) lines.push(`💸 จ่ายออกจากลิ้นชัก ${baht(m.drawerOut)} บาท`)
  if (m.expenses > 0) lines.push(`📝 ค่าใช้จ่ายวันนี้ ${baht(m.expenses)} บาท`)
  lines.push(`${m.netProfit >= 0 ? '📈' : '📉'} กำไรสุทธิ ${m.netProfit < 0 ? '-' : ''}${baht(Math.abs(m.netProfit))} บาท`)

  if (t.branches.length > 1) {
    lines.push('', '🏪 แยกสาขา')
    for (const b of t.branches) {
      lines.push(`• ${b.name}: รับ ${baht(b.revenue)} · กำไร ${b.netProfit < 0 ? '-' : ''}${baht(Math.abs(b.netProfit))}`)
    }
  }

  const todo = actionLines(t.actions)
  lines.push('')
  if (todo.length) {
    lines.push(`⚠️ ต้องจัดการ ${actionCount(t.actions)} เรื่อง`)
    for (const l of todo) lines.push(`• ${l}`)
  } else {
    lines.push('✅ ไม่มีเรื่องค้างให้จัดการ')
  }
  lines.push('', `ดูรายละเอียด: ${origin}/owner`)
  return lines.join('\n')
}
