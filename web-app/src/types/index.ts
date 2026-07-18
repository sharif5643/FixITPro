export type AppRole = 'SUPER_ADMIN' | 'OWNER' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN' | 'STOCK_STAFF'

export interface ShopSettings {
  id: number
  shopName: string
  shopSubtitle?: string | null
  shopPhone?: string | null
  shopAddress?: string | null
  shopEmail?: string | null
  taxId?: string | null
  logoUrl?: string | null
  receiptFooter?: string | null
  paperWidth: string
  vatPercent: number
  defaultDeposit: number
  autoGenerateSku: boolean
  autoGenerateBarcode: boolean
  autoPrint: boolean
  lowStockAlert: number
  repairWarrantyText?: string | null
  paymentQrUrl?: string | null
  showTaxId: boolean
  showLogo: boolean
  lineChannelAccessToken?: string | null
  lineNotifyEnabled: boolean
}

export const ROLE_LABEL: Record<AppRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  OWNER: 'เจ้าของร้าน',
  MANAGER: 'ผู้จัดการ',
  CASHIER: 'แคชเชียร์',
  TECHNICIAN: 'ช่างซ่อม',
  STOCK_STAFF: 'พนักงาน',
}

export const ROLE_DESCRIPTION: Partial<Record<AppRole, string>> = {
  OWNER: 'สิทธิ์เต็มทุกฟีเจอร์ ไม่จำกัดสาขา',
  MANAGER: 'จัดการร้านและทีมงาน ดูรายงาน จัดการสต็อก',
  CASHIER: 'รับออเดอร์ ขายสินค้า รับงานซ่อม',
  TECHNICIAN: 'รับและปิดงานซ่อม จัดการการรับประกัน',
  STOCK_STAFF: 'จัดการสต็อก รับสินค้าเข้า สร้างใบสั่งซื้อ',
}

export const ROLES_REQUIRING_BRANCH: AppRole[] = [
  'MANAGER', 'CASHIER', 'TECHNICIAN', 'STOCK_STAFF',
]

export const ROLE_PRESET_PERMISSIONS: Partial<Record<AppRole, string[]>> = {
  MANAGER: [
    'products.view', 'products.create', 'products.edit', 'products.view_cost',
    'sales.create', 'sales.discount', 'sales.refund',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'supplier.pay',
    'reports.view',
    'claims.manage',
    'serials.manage',
    'expenses.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view', 'notification.manage',
    'data.export',
    'cash_drawer.open_session', 'cash_drawer.join_session', 'cash_drawer.withdraw',
    'cash_drawer.deposit', 'cash_drawer.view_balance', 'cash_drawer.close_session',
    'cash_drawer.approve_difference', 'cash_drawer.manual_open',
  ],
  CASHIER: [
    'products.view',
    'sales.create', 'sales.discount',
    'repair.create', 'repair.edit',
    'serials.manage',
    'warranty.view',
    'notification.view',
    'cash_drawer.open_session', 'cash_drawer.join_session', 'cash_drawer.withdraw',
    'cash_drawer.deposit', 'cash_drawer.view_balance', 'cash_drawer.close_session',
  ],
  TECHNICIAN: [
    'products.view',
    'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
    'serials.manage',
    'warranty.view', 'warranty.manage',
    'technician.view',
    'notification.view',
  ],
  STOCK_STAFF: [
    'products.view',
    'stock.adjust', 'stock.transfer',
    'purchase.create', 'purchase.receive',
    'serials.manage',
    'notification.view',
  ],
}

export type TenantStatus = 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'EXPIRED'
export type TenantPlan = 'TRIAL' | 'BASIC' | 'PRO' | 'ENTERPRISE'

export const TENANT_STATUS_LABEL: Record<TenantStatus, string> = {
  PENDING: 'รอเปิดใช้งาน',
  ACTIVE: 'ใช้งานอยู่',
  SUSPENDED: 'ถูกระงับ',
  EXPIRED: 'หมดอายุ',
}

export const TENANT_PLAN_LABEL: Record<TenantPlan, string> = {
  TRIAL: 'Trial',
  BASIC: 'Basic',
  PRO: 'Pro',
  ENTERPRISE: 'Enterprise',
}

export interface TenantRenewal {
  id: string
  action: string
  plan: TenantPlan
  duration: number
  expiryDate: string
  note?: string
  createdAt: string
  tenantId: string
}

export interface Tenant {
  id: string
  shopName: string
  ownerName: string
  phone?: string
  email: string
  status: TenantStatus
  plan: TenantPlan
  startDate?: string
  expiryDate?: string
  notes?: string
  createdAt: string
  updatedAt: string
  _count?: { users: number }
  renewals?: TenantRenewal[]
}

export type PaymentStatus = 'PENDING' | 'VERIFIED' | 'REJECTED'

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PENDING:  'รอตรวจสอบ',
  VERIFIED: 'ตรวจสอบแล้ว',
  REJECTED: 'ปฏิเสธ',
}

export interface TenantPayment {
  id: string
  plan: TenantPlan
  duration: number
  customExpiryDate?: string
  paymentReference?: string
  paymentDate?: string
  paymentAmount?: number
  paymentNote?: string
  status: PaymentStatus
  adminNote?: string
  verifiedAt?: string
  activatedAt?: string
  createdAt: string
  updatedAt: string
  tenantId: string
  tenant: Pick<Tenant, 'id' | 'shopName' | 'ownerName' | 'email' | 'status' | 'plan' | 'expiryDate'>
  verifiedById?: string
  verifiedBy?: { id: string; name: string; email: string }
  activatedById?: string
  activatedBy?: { id: string; name: string; email: string }
}

export const ALL_PERMISSIONS = [
  'products.view', 'products.create', 'products.edit', 'products.delete', 'products.view_cost',
  'sales.create', 'sales.discount', 'sales.refund',
  'repair.create', 'repair.edit', 'repair.close', 'repair.approve_estimate', 'repairs.qc.perform',
  'stock.adjust',
  'purchase.create', 'purchase.receive',
  'supplier.pay',
  'reports.view',
  'settings.manage',
  'claims.manage',
  'serials.manage',
  'expenses.manage',
  'warranty.view',
  'warranty.manage',
  'technician.view',
  'data.export',
  'data.import',
  'branches.manage',
  'stock.transfer',
  'audit.view',
  'notification.view',
  'notification.manage',
  'system.backup',
  // Cash Drawer
  'cash_drawer.open_session',
  'cash_drawer.join_session',
  'cash_drawer.withdraw',
  'cash_drawer.deposit',
  'cash_drawer.view_balance',
  'cash_drawer.close_session',
  'cash_drawer.approve_difference',
  'cash_drawer.manual_open',
] as const

export type Permission = (typeof ALL_PERMISSIONS)[number]

export const PERMISSION_LABEL: Record<Permission, string> = {
  'products.view': 'ดูสินค้า',
  'products.create': 'เพิ่มสินค้า',
  'products.edit': 'แก้ไขสินค้า',
  'products.delete': 'ลบสินค้า',
  'products.view_cost': 'ดูต้นทุน',
  'sales.create': 'สร้างบิลขาย',
  'sales.discount': 'ให้ส่วนลด',
  'sales.refund': 'คืนสินค้า/ยกเลิกบิล',
  'repair.create': 'รับงานซ่อม',
  'repair.edit': 'แก้ไขงานซ่อม',
  'repair.close': 'ปิดงานซ่อม',
  'repair.approve_estimate': 'อนุมัติใบประเมิน',
  'repairs.qc.perform': 'ทำ QC งานซ่อม',
  'stock.adjust': 'ปรับสต็อก',
  'purchase.create': 'สร้างใบสั่งซื้อ',
  'purchase.receive': 'รับสินค้าเข้า',
  'supplier.pay': 'จ่ายเงินซัพพลายเออร์',
  'reports.view': 'ดูรายงาน',
  'settings.manage': 'จัดการตั้งค่า',
  'claims.manage': 'จัดการเคลม',
  'serials.manage': 'จัดการ Serial/IMEI',
  'expenses.manage': 'จัดการค่าใช้จ่าย',
  'warranty.view': 'ดูการรับประกัน',
  'warranty.manage': 'จัดการการรับประกัน',
  'technician.view': 'ดูสถิติช่างซ่อม',
  'data.export': 'ส่งออกข้อมูล',
  'data.import': 'นำเข้าข้อมูล',
  'branches.manage': 'จัดการสาขา',
  'stock.transfer': 'โอนสต็อกระหว่างสาขา',
  'audit.view': 'ดูประวัติกิจกรรม',
  'notification.view': 'ดูการแจ้งเตือน',
  'notification.manage': 'จัดการการแจ้งเตือน',
  'system.backup': 'สำรองข้อมูล',
  'cash_drawer.open_session': 'เปิดรอบลิ้นชัก',
  'cash_drawer.join_session': 'เข้าร่วมรอบลิ้นชัก',
  'cash_drawer.withdraw': 'เบิกเงินออกจากลิ้นชัก',
  'cash_drawer.deposit': 'เติมเงินเข้าลิ้นชัก',
  'cash_drawer.view_balance': 'ดูยอดเงินคงเหลือ',
  'cash_drawer.close_session': 'ปิดรอบลิ้นชัก',
  'cash_drawer.approve_difference': 'อนุมัติยอดเงินขาด/เกิน',
  'cash_drawer.manual_open': 'เปิดลิ้นชักด้วยคำสั่ง',
}

export const PERMISSION_GROUPS = [
  { label: 'สินค้า', perms: ['products.view','products.create','products.edit','products.delete','products.view_cost'] },
  { label: 'การขาย', perms: ['sales.create','sales.discount','sales.refund'] },
  { label: 'งานซ่อม', perms: ['repair.create','repair.edit','repair.close','repair.approve_estimate','repairs.qc.perform'] },
  { label: 'สต็อก', perms: ['stock.adjust'] },
  { label: 'ใบสั่งซื้อ', perms: ['purchase.create','purchase.receive','supplier.pay'] },
  { label: 'รายงาน & ตั้งค่า', perms: ['reports.view','settings.manage'] },
  { label: 'เคลม & Serial', perms: ['claims.manage','serials.manage'] },
  { label: 'การเงิน', perms: ['expenses.manage'] },
  { label: 'การรับประกัน', perms: ['warranty.view','warranty.manage'] },
  { label: 'ช่างซ่อม', perms: ['technician.view'] },
  { label: 'ข้อมูล', perms: ['data.export', 'data.import'] },
  { label: 'สาขา', perms: ['branches.manage', 'stock.transfer'] },
  { label: 'ระบบ', perms: ['audit.view', 'notification.view', 'notification.manage', 'system.backup'] },
  { label: 'ลิ้นชักเงินสด', perms: ['cash_drawer.open_session','cash_drawer.join_session','cash_drawer.withdraw','cash_drawer.deposit','cash_drawer.view_balance','cash_drawer.close_session','cash_drawer.approve_difference','cash_drawer.manual_open'] },
] as const

export interface User {
  id: string
  email: string
  name: string
  phone?: string
  role: AppRole
  isActive: boolean
  tenantId?: string | null
  branchId?: string | null
  branch?: Pick<Branch, 'id' | 'name'>
  lastLoginAt?: string
  createdAt: string
  updatedAt?: string
}

export type BranchStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED'

export interface Branch {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  isActive: boolean
  isDefault: boolean
  branchNumber?: number | null
  status: BranchStatus
  stockCodeSeq: number
  createdAt: string
  updatedAt: string
  _count?: { users: number; sales: number; repairs: number }
}

export interface BranchStock {
  id: string
  branchId: string
  productId: string
  quantity: number
  minStock: number
  stockCode?: string | null
  updatedAt: string
  branch?: Pick<Branch, 'id' | 'name'>
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'type' | 'price'>
}

export type StockTransferStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'IN_TRANSIT'
  | 'RECEIVED'
  | 'COMPLETED'
  | 'CANCELLED'

export interface StockTransfer {
  id: string
  transferNumber: string
  fromBranchId: string
  toBranchId: string
  productId: string
  quantity: number
  status: StockTransferStatus
  note?: string | null
  requestedById?: string | null
  requestedByName?: string | null
  approvedById?: string | null
  approvedByName?: string | null
  approvedAt?: string | null
  rejectedById?: string | null
  rejectedByName?: string | null
  rejectedAt?: string | null
  rejectReason?: string | null
  inTransitById?: string | null
  inTransitByName?: string | null
  inTransitAt?: string | null
  receivedById?: string | null
  receivedByName?: string | null
  receivedAt?: string | null
  completedById?: string | null
  completedByName?: string | null
  completedAt?: string | null
  cancelledAt?: string | null
  cancelReason?: string | null
  createdAt: string
  updatedAt: string
  fromBranch?: Pick<Branch, 'id' | 'name'>
  toBranch?: Pick<Branch, 'id' | 'name'>
  product?: Pick<Product, 'id' | 'name' | 'sku'>
}

export interface CategoryType {
  id: string
  name: string
  slug: string
  createdAt: string
  categories?: Category[]
  _count?: { categories: number }
}

export interface Category {
  id: string
  name: string
  slug: string
  categoryTypeId?: string
  categoryType?: Pick<CategoryType, 'id' | 'name'>
  createdAt: string
  _count?: { products: number }
}

export type WarrantyType = 'NO_WARRANTY' | 'SHOP_WARRANTY' | 'BRAND_WARRANTY'
export type SerialStatus = 'IN_STOCK' | 'SOLD' | 'RETURNED' | 'CLAIMED' | 'DEFECTIVE'

export interface SerialNumber {
  id: string
  serial: string
  status: SerialStatus
  note?: string
  warrantyExpiresAt?: string
  soldAt?: string
  productId: string
  product?: Pick<Product, 'id' | 'name' | 'sku' | 'warrantyType' | 'warrantyDays'>
  saleItemId?: string
  saleItem?: { id: string; sale: { receiptNumber: string; createdAt: string } }
  purchaseOrderItemId?: string
  createdAt: string
  updatedAt: string
}

export interface BranchStockBreakdown {
  branchId: string
  branchName: string
  quantity: number
  stockCode: string | null
  minStock: number
}

export interface BranchAvailability {
  branchId: string
  branchName: string
  quantity: number
  stockCode: string | null
}

export interface Product {
  id: string
  name: string
  sku: string
  barcode?: string
  type: 'PHONE' | 'SIM' | 'ACCESSORY' | 'PART'
  price: number
  costPrice: number
  stock: number
  minStock: number
  description?: string
  imageUrl?: string
  isActive: boolean
  warrantyType: WarrantyType
  warrantyDays?: number
  hasSerial: boolean
  categoryId?: string
  categoryTypeId?: string
  category?: Category & { categoryType?: Pick<CategoryType, 'id' | 'name'> | null }
  createdAt: string
  updatedAt: string
  branchQuantity?: number
  stockCode?: string | null
  hasStockRecord?: boolean
  otherBranchTotal?: number
  branchBreakdown?: BranchStockBreakdown[]
}

export interface Customer {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  note?: string
  points: number
  tags: string[]
  lineUserId?: string | null
  createdAt: string
  updatedAt: string
}

export interface CustomerNote {
  id:            string
  customerId:    string
  note:          string
  createdById:   string | null
  createdByName: string | null
  createdAt:     string
}

export interface SaleItem {
  id: string
  quantity: number
  price: number
  costPrice: number
  discount: number
  total: number
  refundedQty: number
  productId: string
  product: Product
  serialNumbers?: SerialNumber[]
  refundItems?: SaleRefundItem[]
}

export interface SaleRefundItem {
  id: string
  quantity: number
  refundPrice: number
  total: number
  refundId: string
  saleItemId: string
  productId: string
  product?: Pick<Product, 'id' | 'name'>
}

export interface SaleRefund {
  id: string
  refundNumber: string
  reason: string
  totalRefund: number
  paymentMethod: PaymentMethod
  note?: string
  createdAt: string
  saleId: string
  customerId?: string
  customer?: Pick<Customer, 'id' | 'name'>
  createdById: string
  createdBy: { id: string; name: string }
  items: SaleRefundItem[]
}

export interface Sale {
  id: string
  receiptNumber: string
  status: 'PENDING' | 'COMPLETED' | 'PARTIAL_REFUND' | 'REFUNDED' | 'VOIDED'
  subtotal: number
  discount: number
  total: number
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD'
  amountPaid: number
  change: number
  note?: string
  customerId?: string
  customer?: Customer
  userId: string
  user: { id: string; name: string }
  shiftId?: string
  items: SaleItem[]
  refunds?: SaleRefund[]
  createdAt: string
  voidedById?: string | null
  voidedAt?: string | null
  voidReason?: string | null
  voidedBy?: { id: string; name: string } | null
}

export interface RepairPart {
  id: string
  quantity: number
  price: number                 // legacy field (= costPrice)
  costPrice: number | null      // COGS — used in profit reports
  sellPrice: number | null      // extra customer charge — only set when chargeToCustomer=true
  productName: string | null    // snapshot of product.name at add time
  chargeToCustomer: boolean     // true = sellPrice is billed on top of repair price
  isVoided: boolean
  voidedAt: string | null
  productId: string
  product: Pick<Product, 'id' | 'name' | 'sku' | 'costPrice' | 'price'>
  stockMovements: { id: string }[]
}

export interface RepairAdditionalPayment {
  id: string
  amount: number
  paymentMethod: PaymentMethod
  note?: string
  createdAt: string
  repairId: string
  shiftId?: string
  createdById: string
  createdBy: { id: string; name: string }
}

export interface RepairPaymentReversal {
  id: string
  amount: number
  paymentMethod: PaymentMethod
  reason: string
  note?: string
  createdAt: string
  repairId: string
  createdById: string
  createdBy: { id: string; name: string }
}

export interface Repair {
  id: string
  ticketNumber: string
  deviceBrand: string
  deviceModel: string
  deviceColor?: string
  deviceImei?: string
  issue: string
  accessories?: string
  dueDate?: string
  status:
    | 'RECEIVED'
    | 'DIAGNOSING'
    | 'WAITING_APPROVAL'
    | 'APPROVED'
    | 'WAITING_PARTS'
    | 'IN_PROGRESS'
    | 'QC_PENDING'
    | 'COMPLETED'
    | 'READY_PICKUP'
    | 'DELIVERED'
    | 'CANCELLED'
  estimateCost?: number
  finalCost?: number
  deposit: number
  note?: string
  estimatedLaborCost?: number
  estimatedPartsCost?: number
  estimatedTotal?: number
  actualLaborCost?: number
  approvedAt?: string
  approvalNote?: string
  warrantyExpiresAt?: string
  warrantyNote?: string
  branchId?: string | null
  branch?: Pick<Branch, 'id' | 'name'>
  customerId?: string
  customer?: Customer
  technicianId?: string
  technician?: { id: string; name: string }
  parts: RepairPart[]
  deviceType?: string
  deviceConditions?: string[]
  issueTags?: string[]
  discount?: number
  images?: { id: string; url: string; createdAt: string }[]
  _count?: { images: number }
  additionalPayments?: RepairAdditionalPayment[]
  paymentReversals?: RepairPaymentReversal[]
  receivedAt: string
  completedAt?: string
  deliveredAt?: string
  paymentStatus: 'PENDING' | 'PAID'
  paymentMethod?: 'CASH' | 'TRANSFER' | 'CARD'
  paidAmount?: number
  paidAt?: string
  qc?: RepairQc | null
}

export interface RepairQc {
  id: string
  repairId: string
  touchScreen: boolean
  speaker: boolean
  microphone: boolean
  charging: boolean
  camera: boolean
  wifi: boolean
  biometric: boolean
  allPassed: boolean
  note?: string | null
  passedById: string
  passedByName: string
  createdAt: string
}

export interface Shift {
  id: string
  openedAt: string
  closedAt?: string
  openBalance: number
  closeBalance?: number
  note?: string
  isActive: boolean
  userId: string
  user: { id: string; name: string }
  salesCount?: number
  totalSales?: number
}

export interface Supplier {
  id: string
  name: string
  phone?: string
  email?: string
  address?: string
  taxId?: string
  creditDays: number
  note?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export type POStatus = 'DRAFT' | 'ORDERED' | 'PARTIAL_RECEIVED' | 'RECEIVED' | 'CANCELLED'
export type POPaymentStatus = 'UNPAID' | 'PARTIAL_PAID' | 'PAID'

export interface SupplierPayment {
  id: string
  amount: number
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD'
  note: string | null
  paidAt: string
  createdAt: string
  purchaseOrderId: string
}

export interface PurchaseOrderItem {
  id: string
  quantity: number
  receivedQty: number
  unitCost: number
  discount: number
  total: number
  productId: string
  product: Pick<Product, 'id' | 'name' | 'sku' | 'stock'>
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  status: POStatus
  paymentStatus: POPaymentStatus
  paidTotal: number
  orderDate: string
  expectedDate?: string
  dueDate?: string
  subtotal: number
  discount: number
  vatPercent: number
  vatAmount: number
  total: number
  note?: string
  supplierId: string
  supplier: Pick<Supplier, 'id' | 'name' | 'phone'>
  createdById: string
  createdBy: { id: string; name: string }
  items: PurchaseOrderItem[]
  payments?: SupplierPayment[]
  _count?: { items: number }
  createdAt: string
  updatedAt: string
}

export interface SupplierStatementPO {
  id: string
  poNumber: string
  orderDate: string
  dueDate?: string
  total: number
  paidTotal: number
  balance: number
  paymentStatus: POPaymentStatus
  status: POStatus
  daysOverdue: number
}

export interface SupplierStatementPayment {
  id: string
  amount: number
  paymentMethod: PaymentMethod
  note: string | null
  paidAt: string
  poNumber: string
  purchaseOrderId: string
}

export interface SupplierStatement {
  supplier: Supplier
  period: { startDate: string; endDate: string }
  openingBalance: number
  purchases: number
  payments: number
  closingBalance: number
  outstandingPos: SupplierStatementPO[]
  paymentHistory: SupplierStatementPayment[]
}

export interface SupplierAgingRow {
  id: string
  name: string
  creditDays: number
  b0to30: number
  b31to60: number
  b61to90: number
  b90plus: number
  total: number
}

export interface SupplierAging {
  suppliers: SupplierAgingRow[]
  totals: {
    total: number
    b0to30: number
    b31to60: number
    b61to90: number
    b90plus: number
  }
}

export interface ExpenseCategory {
  id: string
  name: string
  code: string
  isActive: boolean
  createdAt: string
  _count?: { expenses: number }
}

export interface Expense {
  id: string
  expenseDate: string
  amount: number
  description: string
  paymentMethod: 'CASH' | 'TRANSFER' | 'CARD'
  referenceNo?: string
  note?: string
  voidedAt?: string | null
  voidReason?: string | null
  voidedById?: string | null
  voidedBy?: { id: string; name: string } | null
  categoryId: string
  category: Pick<ExpenseCategory, 'id' | 'name' | 'code'>
  createdById: string
  createdBy: { id: string; name: string }
  createdAt: string
  updatedAt: string
}

export interface ExpenseSummary {
  date: string
  totalAmount: number
  count: number
  byCategory: Array<{ categoryId: string; categoryName: string; total: number; count: number }>
}

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD'
export type RepairStatus = Repair['status']
export type ProductType = Product['type']

export type ClaimType = 'SHOP' | 'BRAND' | 'SUPPLIER'
export type ClaimStatus =
  | 'OPEN' | 'CHECKING' | 'SENT_SUPPLIER' | 'WAITING_RESULT'
  | 'APPROVED' | 'REJECTED' | 'REPLACED' | 'RETURNED' | 'CLOSED' | 'CANCELLED'

export interface ClaimStatusHistory {
  id: string
  status: ClaimStatus
  note?: string
  createdAt: string
  claimId: string
  createdById: string
  createdBy: { id: string; name: string }
}

export interface Claim {
  id: string
  claimNumber: string
  claimType: ClaimType
  status: ClaimStatus
  symptom: string
  note?: string
  claimCost?: number
  serialNumberId: string
  serialNumber: {
    id: string
    serial: string
    status: SerialStatus
    warrantyExpiresAt?: string
    soldAt?: string
    productId: string
    product: Pick<Product, 'id' | 'name' | 'sku' | 'warrantyType' | 'warrantyDays'>
    saleItemId?: string
    saleItem?: { id: string; sale: { id: string; receiptNumber: string; createdAt: string } }
  }
  replacementSerialId?: string
  replacementSerial?: {
    id: string
    serial: string
    product: Pick<Product, 'id' | 'name' | 'sku'>
  }
  customerId?: string
  customer?: Pick<Customer, 'id' | 'name' | 'phone' | 'email'>
  createdById: string
  createdBy: { id: string; name: string }
  history?: ClaimStatusHistory[]
  _count?: { history: number }
  createdAt: string
  updatedAt: string
}

export type WarrantyStatus = 'ACTIVE' | 'EXPIRED' | 'VOIDED' | 'CLAIMED'
export type WarrantySourceType = 'REPAIR' | 'PRODUCT'

export interface Warranty {
  id:             string
  warrantyNumber: string
  sourceType:     WarrantySourceType
  status:         WarrantyStatus
  startDate:      string
  endDate:        string
  description?:   string | null
  notes?:         string | null
  voidedAt?:      string | null
  voidedReason?:  string | null
  createdById?:   string | null
  createdByName?: string | null
  createdAt:      string
  updatedAt:      string
  customerId?:    string | null
  customer?:      Pick<Customer, 'id' | 'name' | 'phone'> | null
  repairId?:      string | null
  repair?:        { id: string; ticketNumber: string; deviceBrand: string; deviceModel: string; warrantyNote?: string | null } | null
  saleItemId?:    string | null
  saleItem?:      { id: string; product: Pick<Product, 'id' | 'name' | 'sku'>; sale: { receiptNumber: string; createdAt: string } } | null
  serialNumberId?: string | null
  serialNumber?:  { id: string; serial: string } | null
}

export interface TechnicianKpi {
  totalRepairs:       number
  completedRepairs:   number
  cancelledRepairs:   number
  cancellationRate:   number
  avgRepairHours:     number | null
  revenue:            number
  laborRevenue:       number
  partsCost:          number
  laborProfit:        number
  warrantyClaims:     number
  warrantyClaimRate:  number
  repeatRepairs:      number
  inProgressRepairs:  number
}

export interface TechnicianSummary {
  id:           string
  name:         string
  email:        string
  phone:        string | null
  isActive:     boolean
  lastRepairAt: string | null
  kpi:          TechnicianKpi
  rank?:        number
}

export interface TechnicianDetail extends TechnicianSummary {
  createdAt:    string
  recentRepairs: Array<{
    id: string; ticketNumber: string; deviceBrand: string; deviceModel: string
    status: string; receivedAt: string; completedAt?: string; deliveredAt?: string
    finalCost: number | null; paymentStatus: string
    customer?: { id: string; name: string; phone?: string } | null
  }>
  daily: DailyPoint[]
}

export interface DailyPoint {
  date:    string
  repairs: number
  revenue: number
}

export interface ProfitReportPosItem {
  time: string; receiptNumber: string; customer: string | null
  product: string; qty: number; revenue: number; cogs: number; profit: number
}
export interface ProfitReportRepairItem {
  time: string; ticketNumber: string; customer: string | null
  device: string; revenue: number; partsCost: number; laborCost: number; profit: number
}
export interface ProfitReportPackageItem {
  time: string; receiptNumber: string; carrier: string; amount: number; profit: number
}
export interface ProfitReportExpenseItem {
  time: string; category: string; description: string; paymentMethod: string; amount: number
}

export interface ProfitReport {
  period: { startDate: string; endDate: string }
  pos: {
    revenue: number; cogs: number; profit: number; margin: number
    items: ProfitReportPosItem[]
  }
  repair: {
    revenue: number; partsCost: number; laborCost: number; profit: number; count: number; margin: number
    items: ProfitReportRepairItem[]
  }
  package: {
    revenue: number; profit: number; count: number
    items: ProfitReportPackageItem[]
  }
  expenses: {
    total: number
    breakdown: Array<{ code: string; name: string; total: number }>
    items: ProfitReportExpenseItem[]
  }
  summary: {
    grossProfit: number; netProfit: number; totalRevenue: number; grossMargin: number; netMargin: number
  }
}

// ── Super Admin V2 types ──────────────────────────────────────────────────────

export interface SuperAdminBranch {
  id: string
  name: string
  address?: string | null
  phone?: string | null
  isActive: boolean
  isDefault: boolean
  branchNumber?: number | null
  status: BranchStatus
  createdAt: string
  updatedAt: string
  tenantId?: string | null
  tenant?: { id: string; shopName: string } | null
  _count: { users: number; repairs?: number; sales?: number }
}

export interface SuperAdminUser {
  id: string
  email: string
  name: string
  phone?: string | null
  role: string
  isActive: boolean
  lastLoginAt?: string | null
  createdAt: string
  tenantId?: string | null
  branchId?: string | null
  tenant?: { id: string; shopName: string } | null
  branch?: { id: string; name: string } | null
}

export interface SAAnalytics {
  mrr: number
  arr: number
  totalRevenue: number
  revenueByMonth: { month: string; revenue: number }[]
  tenantsByMonth: { month: string; count: number }[]
  planDistribution: { plan: TenantPlan; count: number }[]
  tenantStatusCounts: Record<string, number>
}

export interface AuditLogEntry {
  id: string
  action: string
  target: string
  tenantId?: string | null
  tenantName?: string | null
  actor: string
  time: string
  note?: string | null
}

export interface SystemSettingsShop {
  shopName: string
  shopSubtitle?: string | null
  shopPhone?: string | null
  shopEmail?: string | null
  shopAddress?: string | null
  taxId?: string | null
  receiptFooter?: string | null
  paperWidth: string
  paymentQrUrl?: string | null
  vatPercent: number
  defaultDeposit: number
  lowStockAlert: number
  autoGenerateSku: boolean
  autoGenerateBarcode: boolean
  autoPrint: boolean
  showTaxId: boolean
  showLogo: boolean
}

export interface SystemSettings {
  platform: {
    name: string
    version: string
    environment: string
    timezone: string
    language: string
  }
  security: {
    jwtExpiresIn: string
    cookieMode: string
    cookieSameSite: string
    cookieSecure: boolean
    corsOrigins: string
  }
  database: {
    provider: string
    orm: string
    host: string
    name: string
  }
  shop: SystemSettingsShop | null
}

// ── Module System ─────────────────────────────────────────────────────────────

export interface AppModule {
  key: string
  name: string
  description?: string | null
  isActive: boolean
}

export interface PackageWithModules {
  id: string
  key: string
  name: string
  description?: string | null
  price?: number | null
  isActive: boolean
  sortOrder: number
  modules: { moduleKey: string; module: AppModule }[]
}

export interface TenantModuleStatus {
  key: string
  name: string
  fromPackage: boolean
  override: boolean | null
  effectiveEnabled: boolean
  expiresAt?: string | null
}
