'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  ScrollText, ChevronLeft, ChevronRight, Search, X, Eye,
  Copy, Check, ChevronDown,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PageHeader } from '@/components/ui/page-header'
import { useAuthStore } from '@/store/auth.store'
import { useRouter } from 'next/navigation'
import api from '@/lib/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditLog {
  id: string
  actorId: string | null
  actorName: string | null
  action: string
  entityType: string
  entityId: string | null
  beforeData: Record<string, any> | null
  afterData: Record<string, any> | null
  metadata: Record<string, any> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

interface AuditLogPage {
  items: AuditLog[]
  total: number
  page: number
  limit: number
}

// ── Action / entity constants ──────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  SALE_CREATED:              'สร้างบิลขาย',
  SALE_REFUNDED:             'คืนเงินบิลขาย',
  SALE_VOIDED:               'ยกเลิกบิลขาย',
  PRODUCT_CREATED:           'เพิ่มสินค้า',
  PRODUCT_UPDATED:           'แก้ไขสินค้า',
  PRODUCT_DELETED:           'ลบสินค้า',
  REPAIR_CREATED:            'สร้างงานซ่อม',
  REPAIR_UPDATED:            'อัปเดตงานซ่อม',
  REPAIR_PAYMENT:            'ชำระเงินงานซ่อม',
  REPAIR_PAYMENT_REVERSED:   'ยกเลิกการชำระงานซ่อม',
  REPAIR_ADDITIONAL_PAYMENT: 'ชำระเพิ่มเติมงานซ่อม',
  STOCK_ADJUSTED:            'ปรับสต็อก',
  PO_CREATED:                'สร้างใบสั่งซื้อ',
  PO_UPDATED:                'แก้ไขใบสั่งซื้อ',
  PO_CANCELLED:              'ยกเลิกใบสั่งซื้อ',
  PO_GOODS_RECEIVED:         'รับสินค้า (PO)',
  PO_PAYMENT:                'ชำระซัพพลายเออร์',
  EXPENSE_CREATED:           'บันทึกค่าใช้จ่าย',
  EXPENSE_VOIDED:            'ยกเลิกค่าใช้จ่าย',
  USER_CREATED:              'เพิ่มผู้ใช้',
  USER_UPDATED:              'แก้ไขผู้ใช้',
  USER_STATUS_TOGGLED:       'เปลี่ยนสถานะผู้ใช้',
  USER_PASSWORD_RESET:       'รีเซ็ตรหัสผ่าน',
  USER_BRANCH_ASSIGNED:      'กำหนดสาขาพนักงาน',
  USER_ROLE_CHANGED:         'เปลี่ยนตำแหน่งพนักงาน',
  SHIFT_OPENED:              'เปิดกะ',
  SHIFT_CLOSED:              'ปิดกะ',
  ROLE_PERMISSIONS_SET:      'ตั้งค่าสิทธิ์',
  ROLE_PERMISSION_TOGGLED:   'เปลี่ยนสิทธิ์',
  DEBT_PAYMENT_RECEIVED:     'รับชำระหนี้',
}

const ENTITY_TYPES = [
  'Sale', 'Product', 'Repair', 'PurchaseOrder',
  'Expense', 'User', 'Shift', 'Role',
]

const ACTION_COLOR: Record<string, string> = {
  SALE_CREATED:              'bg-green-100 text-green-700',
  SALE_REFUNDED:             'bg-yellow-100 text-yellow-700',
  SALE_VOIDED:               'bg-red-100 text-red-700',
  PRODUCT_CREATED:           'bg-green-100 text-green-700',
  PRODUCT_UPDATED:           'bg-blue-100 text-blue-700',
  PRODUCT_DELETED:           'bg-red-100 text-red-700',
  REPAIR_CREATED:            'bg-green-100 text-green-700',
  REPAIR_UPDATED:            'bg-blue-100 text-blue-700',
  REPAIR_PAYMENT:            'bg-green-100 text-green-700',
  REPAIR_PAYMENT_REVERSED:   'bg-red-100 text-red-700',
  REPAIR_ADDITIONAL_PAYMENT: 'bg-blue-100 text-blue-700',
  STOCK_ADJUSTED:            'bg-purple-100 text-purple-700',
  PO_CREATED:                'bg-green-100 text-green-700',
  PO_UPDATED:                'bg-blue-100 text-blue-700',
  PO_CANCELLED:              'bg-red-100 text-red-700',
  PO_GOODS_RECEIVED:         'bg-teal-100 text-teal-700',
  PO_PAYMENT:                'bg-green-100 text-green-700',
  EXPENSE_CREATED:           'bg-orange-100 text-orange-700',
  EXPENSE_VOIDED:            'bg-red-100 text-red-700',
  USER_CREATED:              'bg-green-100 text-green-700',
  USER_UPDATED:              'bg-blue-100 text-blue-700',
  USER_STATUS_TOGGLED:       'bg-yellow-100 text-yellow-700',
  USER_PASSWORD_RESET:       'bg-yellow-100 text-yellow-700',
  USER_BRANCH_ASSIGNED:      'bg-teal-100 text-teal-700',
  USER_ROLE_CHANGED:         'bg-indigo-100 text-indigo-700',
  SHIFT_OPENED:              'bg-teal-100 text-teal-700',
  SHIFT_CLOSED:              'bg-slate-100 text-slate-700',
  ROLE_PERMISSIONS_SET:      'bg-indigo-100 text-indigo-700',
  ROLE_PERMISSION_TOGGLED:   'bg-indigo-100 text-indigo-700',
  DEBT_PAYMENT_RECEIVED:     'bg-green-100 text-green-700',
}

// ── Field formatting ───────────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  amount:              'จำนวนเงิน',
  description:         'รายละเอียด',
  paymentMethod:       'วิธีชำระ',
  customerName:        'ลูกค้า',
  total:               'ยอดรวม',
  status:              'สถานะ',
  name:                'ชื่อ',
  price:               'ราคาขาย',
  cost:                'ราคาทุน',
  stock:               'จำนวนสต็อก',
  sku:                 'รหัสสินค้า',
  category:            'หมวดหมู่',
  note:                'หมายเหตุ',
  openBalance:         'ยอดเงินเปิดกะ',
  closeBalance:        'ยอดเงินปิดกะ',
  openedAt:            'เวลาเปิดกะ',
  closedAt:            'เวลาปิดกะ',
  totalSales:          'ยอดขายรวม',
  salesCount:          'จำนวนบิล',
  expectedBalance:     'ยอดเงินที่คาดหวัง',
  actualBalance:       'ยอดเงินจริง',
  difference:          'ผลต่าง',
  brand:               'ยี่ห้อ',
  model:               'รุ่น',
  problem:             'อาการเสีย',
  estimatedCost:       'ค่าประเมิน',
  paidAmount:          'ยอดชำระ',
  technicianName:      'ช่างซ่อม',
  role:                'บทบาท',
  email:               'อีเมล',
  phone:               'เบอร์โทร',
  supplierName:        'ซัพพลายเออร์',
  itemCount:           'จำนวนรายการ',
  reason:              'เหตุผล',
  delta:               'จำนวนที่ปรับ',
  productName:         'ชื่อสินค้า',
  isActive:            'สถานะใช้งาน',
  refundAmount:        'ยอดคืนเงิน',
  discountAmount:      'ส่วนลด',
  serialNumber:        'ซีเรียล',
  profit:              'กำไร',
  before:              'ก่อน',
  after:               'หลัง',
  cashExpenses:        'ค่าใช้จ่ายเงินสด',
  packageAmount:       'ยอดแพ็กเกจ',
  repairCount:         'จำนวนงานซ่อม',
  expenseCount:        'จำนวนค่าใช้จ่าย',
  permissions:         'สิทธิ์',
  permission:          'สิทธิ์',
  enabled:             'เปิดใช้งาน',
  username:            'ชื่อผู้ใช้',
}

const MONEY_FIELDS = new Set([
  'amount', 'total', 'price', 'cost', 'openBalance', 'closeBalance',
  'totalSales', 'expectedBalance', 'actualBalance', 'difference',
  'estimatedCost', 'paidAmount', 'refundAmount', 'discountAmount',
  'profit', 'packageAmount', 'cashExpenses', 'delta',
])

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH:     'เงินสด',
  TRANSFER: 'โอนเงิน',
  CARD:     'บัตรเครดิต',
  QR:       'QR Code',
  CREDIT:   'เชื่อ',
  OTHER:    'อื่นๆ',
}

const STATUS_LABELS: Record<string, string> = {
  PENDING:       'รอดำเนินการ',
  IN_PROGRESS:   'กำลังดำเนินการ',
  WAITING_PART:  'รอชิ้นส่วน',
  DONE:          'เสร็จแล้ว',
  CANCELLED:     'ยกเลิกแล้ว',
  PAID:          'ชำระแล้ว',
  UNPAID:        'ยังไม่ชำระ',
  VOIDED:        'ยกเลิก',
  ACTIVE:        'ใช้งาน',
  INACTIVE:      'ไม่ใช้งาน',
  OPEN:          'เปิดอยู่',
  CLOSED:        'ปิดแล้ว',
  DRAFT:         'ร่าง',
  ORDERED:       'สั่งซื้อแล้ว',
  RECEIVED:      'รับแล้ว',
  COMPLETED:     'สำเร็จ',
  REFUNDED:      'คืนเงินแล้ว',
}

function formatMoney(v: number) {
  return new Intl.NumberFormat('th-TH', {
    style: 'currency', currency: 'THB', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(v)
}

function formatFieldValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่ใช่'
  if (key === 'paymentMethod' && typeof value === 'string') return PAYMENT_METHOD_LABELS[value] ?? value
  if (key === 'status' && typeof value === 'string') return STATUS_LABELS[value] ?? value
  if (key === 'isActive' || key === 'enabled') return value ? 'ใช้งาน' : 'ไม่ใช้งาน'
  if (MONEY_FIELDS.has(key) && typeof value === 'number') return formatMoney(value)
  if (typeof value === 'number') return value.toLocaleString('th-TH')
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      try { return format(new Date(value), 'dd MMM yyyy HH:mm', { locale: th }) } catch { /* fall through */ }
    }
    if (key === 'status') return STATUS_LABELS[value] ?? value
    return value
  }
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function getFieldLabel(key: string) {
  return FIELD_LABELS[key] ?? key
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DataFieldList({ data }: { data: Record<string, any> }) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined && data[k] !== null)
  if (keys.length === 0) return <p className="text-sm text-slate-400 italic">ไม่มีข้อมูล</p>
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden">
      {keys.map((key) => (
        <div key={key} className="flex items-start gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0">
          <span className="text-xs text-slate-400 shrink-0 w-32 pt-0.5 leading-snug">
            {getFieldLabel(key)}
          </span>
          <span className="text-sm text-slate-800 dark:text-white font-medium break-all leading-snug">
            {formatFieldValue(key, data[key])}
          </span>
        </div>
      ))}
    </div>
  )
}

function ComparisonTable({
  before,
  after,
}: {
  before: Record<string, any>
  after: Record<string, any>
}) {
  const [showUnchanged, setShowUnchanged] = useState(false)

  const combined = Object.keys(before).concat(Object.keys(after))
  const allKeys = combined.filter((k, i) => combined.indexOf(k) === i)
  const changedKeys = allKeys.filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  )
  const unchangedKeys = allKeys.filter(
    (k) => JSON.stringify(before[k]) === JSON.stringify(after[k]),
  )

  return (
    <div className="space-y-3">
      {changedKeys.length === 0 ? (
        <p className="text-sm text-slate-400 italic">ไม่พบการเปลี่ยนแปลง</p>
      ) : (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden">
          {/* column headers */}
          <div className="grid grid-cols-[1fr_1fr_1fr] bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700/60 text-xs font-semibold text-slate-500 dark:text-slate-400">
            <div className="px-3 py-2">ฟิลด์</div>
            <div className="px-3 py-2 text-red-600">ก่อน</div>
            <div className="px-3 py-2 text-green-700">หลัง</div>
          </div>
          {changedKeys.map((key) => (
            <div
              key={key}
              className="grid grid-cols-[1fr_1fr_1fr] border-b border-slate-100 dark:border-slate-700/60 last:border-0 text-sm"
            >
              <div className="px-3 py-2 text-xs text-slate-500 self-center leading-snug">
                {getFieldLabel(key)}
              </div>
              <div className="px-3 py-2 bg-red-50 text-red-700 break-all text-xs leading-snug">
                {key in before ? (
                  formatFieldValue(key, before[key])
                ) : (
                  <span className="italic text-red-300">ไม่มีค่า</span>
                )}
              </div>
              <div className="px-3 py-2 bg-green-50 text-green-700 break-all text-xs leading-snug">
                {key in after ? (
                  formatFieldValue(key, after[key])
                ) : (
                  <span className="italic text-green-300">ลบแล้ว</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {unchangedKeys.length > 0 && (
        <div>
          <button
            onClick={() => setShowUnchanged((v) => !v)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${showUnchanged ? 'rotate-180' : ''}`}
            />
            ฟิลด์ที่ไม่เปลี่ยนแปลง ({unchangedKeys.length})
          </button>
          {showUnchanged && (
            <div className="mt-1.5 rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden">
              {unchangedKeys.map((key) => (
                <div
                  key={key}
                  className="flex items-start gap-3 px-3 py-2 border-b border-slate-100 dark:border-slate-700/60 last:border-0"
                >
                  <span className="text-xs text-slate-400 shrink-0 w-32 pt-0.5">
                    {getFieldLabel(key)}
                  </span>
                  <span className="text-xs text-slate-500 break-all">
                    {formatFieldValue(key, after[key])}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function RawJsonBlock({ label, data }: { label: string; data: Record<string, any> }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  function copy() {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700/60 overflow-hidden">
      <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ChevronDown
            className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
          />
          {label}
        </button>
        {open && (
          <button
            onClick={copy}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-700 px-2 py-0.5 rounded hover:bg-white transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-green-500" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
          </button>
        )}
      </div>
      {open && (
        <pre className="text-xs p-3 overflow-x-auto whitespace-pre-wrap break-words text-slate-600 dark:text-slate-400 bg-white dark:bg-[#1E293B] border-t border-slate-200 dark:border-slate-700/60">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  )
}

function DetailModalContent({ log }: { log: AuditLog }) {
  const hasBoth = !!(log.beforeData && log.afterData)
  const hasRaw  = !!(log.afterData || log.beforeData || log.metadata)

  return (
    <div className="overflow-y-auto flex-1 p-5 space-y-5">
      {/* Meta row */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs bg-slate-50 dark:bg-slate-800/60 rounded-lg px-4 py-3 border border-slate-100 dark:border-slate-700/60">
        <div>
          <span className="text-slate-400">ประเภท  </span>
          <span className="text-slate-700 font-medium">{log.entityType}</span>
        </div>
        {log.entityId && (
          <div className="truncate">
            <span className="text-slate-400">ID  </span>
            <span className="text-slate-600 font-mono">{log.entityId}</span>
          </div>
        )}
        {log.actorName && (
          <div>
            <span className="text-slate-400">ผู้กระทำ  </span>
            <span className="text-slate-700 font-medium">{log.actorName}</span>
          </div>
        )}
        {log.ipAddress && (
          <div>
            <span className="text-slate-400">IP  </span>
            <span className="text-slate-600">{log.ipAddress}</span>
          </div>
        )}
      </div>

      {/* Main data section */}
      {hasBoth ? (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
            การเปลี่ยนแปลง
          </p>
          <ComparisonTable before={log.beforeData!} after={log.afterData!} />
        </div>
      ) : (
        <>
          {log.afterData && Object.keys(log.afterData).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                ข้อมูล
              </p>
              <DataFieldList data={log.afterData} />
            </div>
          )}
          {log.beforeData && Object.keys(log.beforeData).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                ข้อมูลก่อนการเปลี่ยนแปลง
              </p>
              <DataFieldList data={log.beforeData} />
            </div>
          )}
        </>
      )}

      {/* Metadata */}
      {log.metadata && Object.keys(log.metadata).length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
            ข้อมูลเพิ่มเติม
          </p>
          <DataFieldList data={log.metadata} />
        </div>
      )}

      {/* Raw JSON (developer section) */}
      {hasRaw && (
        <div className="space-y-2 border-t border-slate-100 dark:border-slate-700/60 pt-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            ข้อมูลดิบ (JSON)
          </p>
          {log.afterData  && <RawJsonBlock label="afterData"  data={log.afterData} />}
          {log.beforeData && <RawJsonBlock label="beforeData" data={log.beforeData} />}
          {log.metadata   && <RawJsonBlock label="metadata"   data={log.metadata} />}
        </div>
      )}
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function sevenDaysAgoStr() {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function AuditLogsPage() {
  const hasPerm = useAuthStore((s) => s.hasPermission)
  const router  = useRouter()

  const [page,       setPage]       = useState(1)
  const [search,     setSearch]     = useState('')
  const [entityType, setEntityType] = useState('')
  const [startDate,  setStartDate]  = useState(sevenDaysAgoStr())
  const [endDate,    setEndDate]    = useState(todayStr())
  const [selected,   setSelected]   = useState<AuditLog | null>(null)

  const authorized = hasPerm('audit.view')

  const { data, isLoading } = useQuery<AuditLogPage>({
    queryKey: ['audit-logs', page, search, entityType, startDate, endDate],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: '50' })
      if (search)     params.set('action',     search)
      if (entityType) params.set('entityType', entityType)
      if (startDate)  params.set('startDate',  startDate)
      if (endDate)    params.set('endDate',     endDate)
      return (await api.get(`/audit-logs?${params}`)).data
    },
    staleTime: 30_000,
    enabled: authorized,
  })

  if (!authorized) {
    router.replace('/403')
    return null
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setPage(1)
  }

  function resetFilters() {
    setSearch('')
    setEntityType('')
    setStartDate(sevenDaysAgoStr())
    setEndDate(todayStr())
    setPage(1)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="ประวัติกิจกรรม"
        icon={ScrollText}
        subtitle="Audit Log — บันทึกทุกการกระทำในระบบ"
      />

      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
        <Input
          placeholder="ค้นหาชื่อ Action..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-44"
        />
        <select
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1) }}
          className="border border-slate-200 dark:border-slate-700/60 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-[#1E293B] dark:text-white"
        >
          <option value="">ทุกประเภท</option>
          {ENTITY_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => { setStartDate(e.target.value); setPage(1) }}
          className="w-36"
        />
        <span className="self-center text-slate-400 text-sm">ถึง</span>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => { setEndDate(e.target.value); setPage(1) }}
          className="w-36"
        />
        <Button type="submit" variant="outline" size="sm">
          <Search className="h-4 w-4 mr-1" /> ค้นหา
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
          <X className="h-4 w-4 mr-1" /> ล้าง
        </Button>
      </form>

      {/* Table */}
      <div className="bg-white dark:bg-[#1E293B] rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">กำลังโหลด...</div>
        ) : !data?.items.length ? (
          <div className="p-8 text-center text-slate-400">ไม่พบข้อมูล</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700/60">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">วันเวลา</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">ผู้กระทำ</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">ประเภท</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400 whitespace-nowrap">Entity ID</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 dark:text-slate-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-slate-600 dark:text-slate-400 text-xs">
                      {format(new Date(log.createdAt), 'dd MMM yy HH:mm', { locale: th })}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-medium text-slate-800 dark:text-white">{log.actorName ?? '—'}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ACTION_COLOR[log.action] ?? 'bg-slate-100 text-slate-700'}`}>
                        {ACTION_LABELS[log.action] ?? log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-xs">{log.entityType}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400 text-xs font-mono">
                      {log.entityId ? log.entityId.slice(-8) : '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {(log.afterData || log.beforeData || log.metadata) && (
                        <button
                          onClick={() => setSelected(log)}
                          className="text-blue-500 hover:text-blue-700 p-1 rounded hover:bg-blue-50 transition-colors"
                          aria-label="ดูรายละเอียด"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400">
          <span>ทั้งหมด {data.total.toLocaleString()} รายการ</span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline" size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs px-2">{page} / {totalPages}</span>
            <Button
              variant="outline" size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-white dark:bg-[#1E293B] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700/60 shrink-0 gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold shrink-0 ${ACTION_COLOR[selected.action] ?? 'bg-slate-100 text-slate-700'}`}
                  >
                    {ACTION_LABELS[selected.action] ?? selected.action}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  {format(new Date(selected.createdAt), 'dd MMM yyyy HH:mm:ss', { locale: th })}
                  {selected.actorName && (
                    <span className="text-slate-700 font-medium"> · {selected.actorName}</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors mt-0.5"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body — keyed so internal state resets on log change */}
            <DetailModalContent key={selected.id} log={selected} />
          </div>
        </div>
      )}
    </div>
  )
}
