import type { DashboardOverview, OwnerSummaryData, SmartInsight, DailyPriority } from './types'

// ── Thai timezone helper ──────────────────────────────────────────────────────

export function thaiToday(): Date {
  return new Date(Date.now() + 7 * 3_600_000)
}

export function thaiDateString(offsetDays = 0): string {
  const d = new Date(Date.now() + 7 * 3_600_000 + offsetDays * 86_400_000)
  return d.toISOString().slice(0, 10)
}

// ── Yesterday comparison from weeklyRevenue ───────────────────────────────────

export function computeRevenueDelta(
  weeklyRevenue: DashboardOverview['weeklyRevenue'] | undefined,
): number | null {
  if (!weeklyRevenue || weeklyRevenue.length < 2) return null
  const todayStr     = thaiDateString(0)
  const yesterdayStr = thaiDateString(-1)
  const todayEntry     = weeklyRevenue.find(d => d.date === todayStr)
  const yesterdayEntry = weeklyRevenue.find(d => d.date === yesterdayStr)
  if (!todayEntry || !yesterdayEntry || yesterdayEntry.total === 0) return null
  return Math.round(((todayEntry.total - yesterdayEntry.total) / yesterdayEntry.total) * 100)
}

// ── Deterministic smart insights ──────────────────────────────────────────────

export function computeInsights(
  overview: DashboardOverview | undefined,
  summary: OwnerSummaryData | undefined,
): SmartInsight[] {
  if (!overview || !summary) return []

  const insights: SmartInsight[] = []
  const today  = summary.today
  const ops    = overview.repairOps
  const health = summary.health
  const weekly = overview.weeklyRevenue

  // Net profit negative
  if (today.netProfit < 0) {
    insights.push({ level: 'critical', text: 'กำไรสุทธิวันนี้ติดลบ — ค่าใช้จ่ายเกินรายรับ' })
  }

  // Overdue repairs (critical threshold)
  if (ops.overdueRepairs >= 3) {
    insights.push({ level: 'critical', text: `งานซ่อมเกินกำหนด ${ops.overdueRepairs} งาน — ควรติดต่อลูกค้าวันนี้` })
  } else if (ops.overdueRepairs >= 1) {
    insights.push({ level: 'warning', text: `มีงานซ่อมเกินกำหนด ${ops.overdueRepairs} งาน` })
  }

  // Revenue vs 7-day average
  if (weekly.length >= 3) {
    const past = weekly.slice(0, -1)
    const avg  = past.reduce((s, d) => s + d.total, 0) / past.length
    const todayTotal = weekly.at(-1)?.total ?? today.totalRevenue
    if (avg > 0 && todayTotal < avg * 0.7) {
      const pct = Math.round((1 - todayTotal / avg) * 100)
      insights.push({ level: 'warning', text: `รายรับต่ำกว่าค่าเฉลี่ย 7 วัน ${pct}%` })
    } else if (avg > 0 && todayTotal > avg * 1.3) {
      const pct = Math.round((todayTotal / avg - 1) * 100)
      insights.push({ level: 'positive', text: `รายรับสูงกว่าค่าเฉลี่ย 7 วัน ${pct}% — วันที่ดี` })
    }
  }

  // High expenses
  if (health.highExpenses && today.totalRevenue > 0) {
    const ratio = Math.round((today.totalExpenses / today.totalRevenue) * 100)
    insights.push({ level: 'warning', text: `ค่าใช้จ่าย ${ratio}% ของรายรับ — สูงกว่าปกติ` })
  }

  // Growing pickup queue
  if (ops.completedNotDelivered >= 5) {
    insights.push({ level: 'warning', text: `งานรอรับสินค้า ${ops.completedNotDelivered} ชิ้น — ควรแจ้งลูกค้ามารับ` })
  }

  // Unpaid debt
  if (ops.unpaidDebtCount >= 3) {
    insights.push({ level: 'warning', text: `บิลค้างชำระ ${ops.unpaidDebtCount} ใบ — ควรติดตามการชำระเงิน` })
  }

  // Low stock risk
  if (health.hasLowStock) {
    insights.push({ level: 'info', text: 'มีสินค้าใกล้หมดหรือหมดสต็อก — ควรสั่งเติมก่อนขาด' })
  }

  // New customers (positive)
  if (today.newCustomers >= 3) {
    insights.push({ level: 'positive', text: `ลูกค้าใหม่ ${today.newCustomers} คนวันนี้ — เติบโตดี` })
  }

  // Cap at 4 insights, prioritise by level
  const ORDER = { critical: 0, warning: 1, info: 2, positive: 3 }
  return insights
    .sort((a, b) => ORDER[a.level] - ORDER[b.level])
    .slice(0, 4)
}

// ── Sprint 2: time-of-day helper ──────────────────────────────────────────────

export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = thaiToday().getUTCHours()
  if (h >= 5 && h < 12) return 'morning'
  if (h >= 12 && h < 17) return 'afternoon'
  if (h >= 17 && h < 21) return 'evening'
  return 'night'
}

// ── Sprint 2: actionable daily priorities from live data ──────────────────────

export function computePriorities(
  overview: DashboardOverview | undefined,
  summary: OwnerSummaryData | undefined,
): DailyPriority[] {
  if (!overview || !summary) return []

  const items: DailyPriority[] = []
  const { alerts, repairOps, currentShift } = overview

  if (!currentShift.isOpen) {
    items.push({ id: 'shift', level: 'critical', text: 'ยังไม่ได้เปิดกะวันนี้', link: '/shifts', linkLabel: 'เปิดกะ' })
  }
  if (alerts.overdueRepairs > 0) {
    items.push({ id: 'overdue', level: 'critical', text: `งานซ่อมเกินกำหนด ${alerts.overdueRepairs} ชิ้น`, link: '/repairs', linkLabel: 'ดูงาน' })
  }
  if (alerts.outOfStock > 0) {
    items.push({ id: 'out_of_stock', level: 'critical', text: `สินค้าหมดสต็อก ${alerts.outOfStock} รายการ`, link: '/stock', linkLabel: 'ดูสต็อก' })
  }
  if (repairOps.waitingApproval > 0) {
    items.push({ id: 'approval', level: 'warning', text: `รออนุมัติ ${repairOps.waitingApproval} งาน`, link: '/repairs?status=WAITING_APPROVAL', linkLabel: 'อนุมัติ' })
  }
  if (alerts.unpaidDebt > 0) {
    items.push({ id: 'debt', level: 'warning', text: `หนี้ค้างชำระ ${alerts.unpaidDebt} รายการ`, link: '/customers', linkLabel: 'ติดตาม' })
  }
  if (repairOps.completedNotDelivered >= 3) {
    items.push({ id: 'pickup', level: 'warning', text: `รอรับงาน ${repairOps.completedNotDelivered} ชิ้น — แจ้งลูกค้า`, link: '/repairs?status=READY_PICKUP', linkLabel: 'แจ้งลูกค้า' })
  }
  if (alerts.lowStock > 0) {
    items.push({ id: 'low_stock', level: 'info', text: `สต็อกใกล้หมด ${alerts.lowStock} รายการ`, link: '/stock', linkLabel: 'สั่งซื้อ' })
  }
  if (alerts.expiringWarranties > 0) {
    items.push({ id: 'warranty', level: 'info', text: `ประกันใกล้หมดอายุ ${alerts.expiringWarranties} รายการ`, link: '/repairs', linkLabel: 'ดู' })
  }

  return items.slice(0, 6)
}
