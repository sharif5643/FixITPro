// ── Dashboard API response types ──────────────────────────────────────────────

export interface DashboardOverview {
  finance: {
    totalRevenue: number; salesRevenue: number; salesCount: number
    repairRevenue: number; repairCount: number; totalExpenses: number
    grossProfit: number; netProfit: number
  }
  repairOps: {
    openRepairs: number; waitingApproval: number; waitingParts: number
    inProgress: number; completedNotDelivered: number; overdueRepairs: number
    unpaidDebtTotal: number; unpaidDebtCount: number
  }
  stock: { outOfStock: number; lowStock: number }
  topTechnicians: { id: string; name: string; repairCount: number; repairRevenue: number }[]
  branchPerformance: {
    branchId: string; name: string; totalRevenue: number
    openRepairs: number; overdueRepairs: number; health: 'NORMAL' | 'WARNING' | 'CRITICAL'
  }[]
  weeklyRevenue: { date: string; sales: number; repairs: number; packages: number; total: number }[]
  notifications: {
    unreadCount: number
    latest: { id: string; type: string; title: string; message: string; severity: string; createdAt: string }[]
  }
  recentActivities: {
    id: string; action: string; entityType: string | null; actorName: string | null; createdAt: string
  }[]
  currentShift: {
    isOpen: boolean; openedAt: string | null; userName: string | null; openBalance: number
  }
  alerts: {
    overdueRepairs: number; unpaidRepairs: number; unpaidDebt: number
    outOfStock: number; lowStock: number; expiringWarranties: number
    pendingClaims: number; overdueSuppliers: number; apOutstanding: number
  }
}

export interface OwnerSummaryData {
  today: {
    salesRevenue: number; repairRevenue: number; totalRevenue: number
    grossProfit: number; totalExpenses: number; netProfit: number; newCustomers: number
  }
  monthly: {
    totalRevenue: number; grossProfit: number; netProfit: number
  }
  health: {
    abnormalPendingRepairs: boolean; hasLowStock: boolean
    highExpenses: boolean; belowAverageSales: boolean; hasOutstandingDebt: boolean
  }
  repairStats: {
    openRepairs: number; overdueRepairs: number; unpaidDebtCount: number
    outOfStock: number; lowStock: number
  }
}

export type SeverityKey = 'CRITICAL' | 'WARNING' | 'INFO' | 'SUCCESS'

export interface SmartInsight {
  text: string
  level: 'critical' | 'warning' | 'info' | 'positive'
}

// ── Sprint 2: Operational Intelligence ───────────────────────────────────────

export interface LowStockItem {
  id: string
  productId: string
  name: string
  sku: string
  stock: number
  minStock: number
  branchId: string
  branchName: string
  stockCode: string | null
  severity: 'OUT_OF_STOCK' | 'LOW_STOCK'
}

export interface CustomerDebtItem {
  customerId: string
  name: string
  phone: string
  totalDebt: number
  repairCount: number
}

export interface DailyPriority {
  id: string
  text: string
  level: 'critical' | 'warning' | 'info'
  link: string
  linkLabel: string
}
