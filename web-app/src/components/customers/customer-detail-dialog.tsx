'use client'

import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  Loader2,
  User,
  Phone,
  Mail,
  MapPin,
  ShoppingCart,
  Wrench,
  Pencil,
  Crown,
  Star,
  Sparkles,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { Customer, RepairStatus } from '@/types'

type Tier = 'VIP' | 'REGULAR' | 'NEW'

function getTier(salesCount: number, totalSpending: number): Tier {
  if (totalSpending >= 10000) return 'VIP'
  if (salesCount >= 3) return 'REGULAR'
  return 'NEW'
}

const TIER_CONFIG: Record<Tier, { label: string; Icon: React.ElementType; cls: string }> = {
  VIP:     { label: 'VIP',    Icon: Crown,    cls: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  REGULAR: { label: 'ประจำ', Icon: Star,     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  NEW:     { label: 'ใหม่',  Icon: Sparkles, cls: 'bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700/60' },
}

interface CustomerDetail extends Customer {
  totalSpending: number
  _count: { sales: number; repairs: number }
  sales: {
    id: string
    receiptNumber: string
    total: number
    status: string
    createdAt: string
  }[]
  repairs: {
    id: string
    ticketNumber: string
    deviceBrand: string
    deviceModel: string
    status: RepairStatus
    receivedAt: string
  }[]
}

const SALE_STATUS_LABEL: Record<string, string> = {
  PENDING: 'รอดำเนินการ',
  COMPLETED: 'สำเร็จ',
  REFUNDED: 'คืนเงิน',
  VOIDED: 'ยกเลิก',
}
const SALE_STATUS_COLOR: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  COMPLETED: 'bg-green-100 text-green-700',
  REFUNDED: 'bg-blue-100 text-blue-700',
  VOIDED: 'bg-red-100 text-red-700',
}

const REPAIR_STATUS_LABEL: Record<RepairStatus, string> = {
  RECEIVED:         'รับงาน',
  DIAGNOSING:       'ตรวจสอบ',
  WAITING_APPROVAL: 'รอลูกค้าอนุมัติ',
  APPROVED:         'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',
  IN_PROGRESS:      'กำลังซ่อม',
  QC_PENDING:       'รอ QC',
  COMPLETED:        'ซ่อมเสร็จ',
  READY_PICKUP:     'พร้อมรับเครื่อง',
  DELIVERED:        'ส่งคืนแล้ว',
  CANCELLED:        'ยกเลิก',
}
const REPAIR_STATUS_COLOR: Record<RepairStatus, string> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  QC_PENDING:       'bg-indigo-100 text-indigo-700',
  COMPLETED:        'bg-green-100 text-green-700',
  READY_PICKUP:     'bg-emerald-100 text-emerald-700',
  DELIVERED:        'bg-slate-100 text-slate-700 dark:text-slate-300',
  CANCELLED:        'bg-red-100 text-red-700',
}

interface CustomerDetailDialogProps {
  customerId: string | null
  onClose: () => void
  onEdit: (customer: Customer) => void
}

export function CustomerDetailDialog({
  customerId,
  onClose,
  onEdit,
}: CustomerDetailDialogProps) {
  const { data: customer, isLoading } = useQuery<CustomerDetail>({
    queryKey: ['customers', customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data,
    enabled: !!customerId,
  })

  return (
    <Dialog open={!!customerId} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="text-blue-600" style={{ width: 18, height: 18 }} />
            รายละเอียดลูกค้า
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-40 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : !customer ? null : (
          <div className="space-y-5">
            {/* Customer info card */}
            <div className="rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/60 p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{customer.name}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    {(() => {
                      const tier = getTier(customer._count.sales, customer.totalSpending)
                      const { label, Icon, cls } = TIER_CONFIG[tier]
                      return (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${cls}`}>
                          <Icon className="h-3 w-3" />
                          {label}
                        </span>
                      )
                    })()}
                    <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                      {customer.points} คะแนน
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 shrink-0"
                  onClick={() => onEdit(customer)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  แก้ไข
                </Button>
              </div>

              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-2 pt-1">
                <div className="rounded-lg bg-white dark:bg-[#1E293B] border border-slate-100 dark:border-slate-700/60 text-center py-2.5 px-1">
                  <p className="text-[10px] text-muted-foreground">ยอดรวม</p>
                  <p className="font-bold text-sm text-blue-700 tabular-nums truncate">
                    {formatThaiMoney(customer.totalSpending)}
                  </p>
                </div>
                <div className="rounded-lg bg-white dark:bg-[#1E293B] border border-slate-100 dark:border-slate-700/60 text-center py-2.5 px-1">
                  <p className="text-[10px] text-muted-foreground">ซื้อทั้งหมด</p>
                  <p className="font-bold text-sm">
                    {customer._count.sales}
                    <span className="text-xs font-normal text-muted-foreground ml-0.5">ครั้ง</span>
                  </p>
                </div>
                <div className="rounded-lg bg-white dark:bg-[#1E293B] border border-slate-100 dark:border-slate-700/60 text-center py-2.5 px-1">
                  <p className="text-[10px] text-muted-foreground">ซ่อมทั้งหมด</p>
                  <p className="font-bold text-sm">
                    {customer._count.repairs}
                    <span className="text-xs font-normal text-muted-foreground ml-0.5">งาน</span>
                  </p>
                </div>
              </div>

              <div className="space-y-1.5 border-t pt-3">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {customer.phone}
                  </div>
                )}
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {customer.email}
                  </div>
                )}
                {customer.address && (
                  <div className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                    <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    <span>{customer.address}</span>
                  </div>
                )}
                {customer.note && (
                  <p className="text-sm text-muted-foreground border-t pt-2 mt-1">
                    {customer.note}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground border-t pt-2">
                สมัครเมื่อ {format(new Date(customer.createdAt), 'dd MMMM yyyy', { locale: th })}
              </p>
            </div>

            {/* Sales history */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <ShoppingCart className="h-4 w-4 text-blue-600" />
                <p className="font-semibold text-slate-900 dark:text-white text-sm">ประวัติการซื้อ</p>
                <span className="text-xs text-muted-foreground ml-auto">
                  {customer.sales.length < customer._count.sales
                    ? `${customer.sales.length} รายการล่าสุด (จาก ${customer._count.sales})`
                    : `${customer.sales.length} รายการ`}
                </span>
              </div>
              {customer.sales.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40">
                  ยังไม่มีประวัติการซื้อ
                </p>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400">
                        <th className="text-left px-3 py-2 font-medium">เลขใบเสร็จ</th>
                        <th className="text-left px-3 py-2 font-medium">สถานะ</th>
                        <th className="text-right px-3 py-2 font-medium">ยอด</th>
                        <th className="text-left px-3 py-2 font-medium">วันที่</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.sales.map((sale) => (
                        <tr key={sale.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono font-semibold text-blue-700">
                            {sale.receiptNumber}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SALE_STATUS_COLOR[sale.status] ?? 'bg-slate-100 text-slate-700 dark:text-slate-300'}`}
                            >
                              {SALE_STATUS_LABEL[sale.status] ?? sale.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium">
                            {formatThaiMoney(Number(sale.total))}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {format(new Date(sale.createdAt), 'dd MMM yy', { locale: th })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Repairs history */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Wrench className="h-4 w-4 text-blue-600" />
                <p className="font-semibold text-slate-900 dark:text-white text-sm">ประวัติงานซ่อม</p>
                <span className="text-xs text-muted-foreground ml-auto">
                  {customer.repairs.length < customer._count.repairs
                    ? `${customer.repairs.length} รายการล่าสุด (จาก ${customer._count.repairs})`
                    : `${customer.repairs.length} รายการ`}
                </span>
              </div>
              {customer.repairs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-5 rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40">
                  ยังไม่มีประวัติงานซ่อม
                </p>
              ) : (
                <div className="rounded-xl border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400">
                        <th className="text-left px-3 py-2 font-medium">เลขงาน</th>
                        <th className="text-left px-3 py-2 font-medium">อุปกรณ์</th>
                        <th className="text-left px-3 py-2 font-medium">สถานะ</th>
                        <th className="text-left px-3 py-2 font-medium">วันที่รับ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customer.repairs.map((repair) => (
                        <tr key={repair.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-mono font-semibold text-blue-700">
                            {repair.ticketNumber}
                          </td>
                          <td className="px-3 py-2 text-slate-900 dark:text-white">
                            {repair.deviceBrand} {repair.deviceModel}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REPAIR_STATUS_COLOR[repair.status] ?? 'bg-slate-100 text-slate-700 dark:text-slate-300'}`}
                            >
                              {REPAIR_STATUS_LABEL[repair.status] ?? repair.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {format(new Date(repair.receivedAt), 'dd MMM yy', { locale: th })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <Button variant="outline" onClick={onClose} className="w-full">
              ปิด
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
