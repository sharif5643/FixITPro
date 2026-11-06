/**
 * The owner hub's data (same shape as the API's /owner-hub/today) and the "ต้องจัดการ" list built
 * from it, each item with the page where it is dealt with.
 */
import { formatThaiMoney } from './utils'

export interface BranchMoney {
  branchId: string | null
  name: string
  revenue: number
  cash: number
  transfer: number
  card: number
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
  branches: BranchMoney[]
  actions: ActionItems
}

export interface ActionRow { label: string; sub?: string; right?: string; href: string; /** a document number (ticket, PO), shown in a fixed-width font */ code?: boolean }
export interface Action { key: string; title: string; hint?: string; href: string; urgent?: boolean; rows?: ActionRow[] }

const TH_DAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** "ศ. 6 พ.ย." for 2026-11-06 */
export function thaiDayLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return `${TH_DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${TH_MONTHS[m - 1]}`
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short' })

/** What waits for the owner, most pressing first; empty when nothing does */
export function actionsOf(a: ActionItems): Action[] {
  const out: Action[] = []
  if (a.longShifts.length) {
    out.push({
      key: 'shifts', urgent: true, href: '/shifts',
      title: `กะเปิดค้างเกิน 1 วัน ${a.longShifts.length} กะ`,
      hint: 'นับเงินแล้วปิดกะ ยอดเงินสดจะได้ไม่ปนข้ามวัน (เจ้าของปิดแทนได้)',
      rows: a.longShifts.map((s) => ({ label: s.userName, sub: s.branchName ?? '', right: `${s.hours} ชม.`, href: '/shifts' })),
    })
  }
  if (a.supplierDue.count) {
    out.push({
      key: 'po', urgent: a.supplierDue.overdue > 0, href: '/purchase-orders',
      title: a.supplierDue.overdue
        ? `ใบสั่งซื้อเลยกำหนดจ่าย ${a.supplierDue.overdue} ใบ${a.supplierDue.count > a.supplierDue.overdue ? ` · ใกล้ครบกำหนด ${a.supplierDue.count - a.supplierDue.overdue} ใบ` : ''}`
        : `ใบสั่งซื้อครบกำหนดจ่ายใน 3 วัน ${a.supplierDue.count} ใบ`,
      hint: `ค้างจ่ายร้านอะไหล่รวม ${formatThaiMoney(a.supplierDue.total)}`,
      rows: a.supplierDue.items.map((p) => ({
        label: p.poNumber, code: true, sub: p.supplier,
        right: `${formatThaiMoney(p.remaining)} · ${p.overdue ? 'เลย' : 'ครบ'} ${shortDate(p.dueDate)}`,
        href: '/purchase-orders',
      })),
    })
  }
  if (a.overdueRepairs.count) {
    out.push({
      key: 'overdue', href: '/repairs',
      title: `งานซ่อมเลยวันนัด ${a.overdueRepairs.count} งาน`,
      hint: 'โทรแจ้งลูกค้าหรือเลื่อนวันนัด',
      rows: a.overdueRepairs.items.map((r) => ({
        label: r.ticketNumber, code: true, sub: [r.customer, r.device].filter(Boolean).join(' · '),
        right: `นัด ${shortDate(r.dueDate)}`, href: `/repairs/${r.id}`,
      })),
    })
  }
  if (a.waitingPickup.count) {
    out.push({
      key: 'pickup', href: '/repairs',
      title: `ซ่อมเสร็จแล้วลูกค้ายังไม่มารับเกิน 7 วัน ${a.waitingPickup.count} เครื่อง`,
      hint: 'ทักลูกค้าให้มารับ เงินค่าซ่อมจะได้เข้าร้าน',
      rows: a.waitingPickup.items.map((r) => ({
        label: r.ticketNumber, code: true, sub: [r.customer, r.device].filter(Boolean).join(' · '),
        right: `${r.days} วัน`, href: `/repairs/${r.id}`,
      })),
    })
  }
  if (a.customerDebt.count) {
    out.push({
      key: 'debt', href: '/debt',
      title: `ลูกค้าค้างจ่ายค่าซ่อม ${a.customerDebt.count} งาน`,
      hint: `รวม ${formatThaiMoney(a.customerDebt.total)} — รับเครื่องไปแล้วแต่ยังจ่ายไม่ครบ`,
    })
  }
  if (a.stock.outOfStock + a.stock.lowStock > 0) {
    out.push({
      key: 'stock', href: '/products',
      title: [a.stock.outOfStock ? `สินค้าหมด ${a.stock.outOfStock} รายการ` : '', a.stock.lowStock ? `ใกล้หมด ${a.stock.lowStock} รายการ` : '']
        .filter(Boolean).join(' · '),
      hint: 'สั่งของเข้าก่อนขายไม่ได้',
    })
  }
  return out
}
