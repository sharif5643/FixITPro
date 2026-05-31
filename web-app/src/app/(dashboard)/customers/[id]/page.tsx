'use client'

import { useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format, formatDistanceToNow } from 'date-fns'
import { th } from 'date-fns/locale'
import { toast } from 'sonner'
import {
  ArrowLeft, User, Phone, Mail, MapPin, ShoppingCart, Wrench,
  Crown, Star, Sparkles, MessageSquarePlus, StickyNote, Pencil,
  AlertCircle, Tag, X, Plus, Clock, TrendingUp, Loader2, BadgeCheck,
  ShieldCheck, ShieldOff, ShieldAlert,
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { CustomerFormDialog } from '@/components/customers/customer-form-dialog'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { Customer, RepairStatus, Warranty, WarrantyStatus } from '@/types'

// ── Types ──────────────────────────────────────────────────────────────────────

interface CustomerNote {
  id:            string
  customerId:    string
  note:          string
  createdById:   string | null
  createdByName: string | null
  createdAt:     string
}

interface CustomerDetail extends Customer {
  totalSpending: number
  unpaidBalance: number
  lastVisitAt:   string | null
  _count:        { sales: number; repairs: number }
  notes:         CustomerNote[]
  sales: {
    id: string; receiptNumber: string; total: number
    status: string; paymentMethod: string; createdAt: string
  }[]
  repairs: {
    id: string; ticketNumber: string; deviceBrand: string; deviceModel: string
    status: RepairStatus; receivedAt: string; finalCost: number | null
    paidAmount: number | null; paymentStatus: string
  }[]
}

type Tab = 'sales' | 'repairs' | 'notes' | 'warranties'
type Tier = 'VIP' | 'REGULAR' | 'NEW'

// ── Constants ──────────────────────────────────────────────────────────────────

function getTier(salesCount: number, totalSpending: number): Tier {
  if (totalSpending >= 10000) return 'VIP'
  if (salesCount >= 3)        return 'REGULAR'
  return 'NEW'
}

const TIER_CONFIG: Record<Tier, { label: string; Icon: React.ElementType; cls: string }> = {
  VIP:     { label: 'VIP',    Icon: Crown,    cls: 'bg-yellow-50 text-yellow-700 border-yellow-300' },
  REGULAR: { label: 'ประจำ', Icon: Star,     cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  NEW:     { label: 'ใหม่',  Icon: Sparkles, cls: 'bg-gray-50 text-gray-500 border-gray-200' },
}

const SALE_STATUS_LABEL: Record<string, string> = {
  COMPLETED: 'สำเร็จ', VOIDED: 'ยกเลิก',
  REFUNDED:  'คืนเงิน', PARTIAL_REFUND: 'คืนบางส่วน',
}
const SALE_STATUS_COLOR: Record<string, string> = {
  COMPLETED:     'bg-green-100 text-green-700',
  VOIDED:        'bg-red-100 text-red-700',
  REFUNDED:      'bg-blue-100 text-blue-700',
  PARTIAL_REFUND:'bg-amber-100 text-amber-700',
}

const REPAIR_STATUS_LABEL: Partial<Record<RepairStatus, string>> = {
  RECEIVED:         'รับงาน',      DIAGNOSING:       'ตรวจสอบ',
  WAITING_APPROVAL: 'รออนุมัติ',  APPROVED:          'อนุมัติแล้ว',
  WAITING_PARTS:    'รออะไหล่',   IN_PROGRESS:       'กำลังซ่อม',
  COMPLETED:        'ซ่อมเสร็จ',  DELIVERED:         'ส่งคืนแล้ว',
  CANCELLED:        'ยกเลิก',
}
const REPAIR_STATUS_COLOR: Partial<Record<RepairStatus, string>> = {
  RECEIVED:         'bg-blue-100 text-blue-700',
  DIAGNOSING:       'bg-yellow-100 text-yellow-700',
  WAITING_APPROVAL: 'bg-amber-100 text-amber-700',
  APPROVED:         'bg-teal-100 text-teal-700',
  WAITING_PARTS:    'bg-orange-100 text-orange-700',
  IN_PROGRESS:      'bg-purple-100 text-purple-700',
  COMPLETED:        'bg-green-100 text-green-700',
  DELIVERED:        'bg-gray-100 text-gray-700',
  CANCELLED:        'bg-red-100 text-red-700',
}

const WARRANTY_STATUS_CONFIG: Record<WarrantyStatus, { label: string; cls: string; Icon: React.ElementType }> = {
  ACTIVE:  { label: 'ใช้งานได้',     cls: 'bg-green-100 text-green-700',  Icon: ShieldCheck },
  EXPIRED: { label: 'หมดอายุ',       cls: 'bg-gray-100 text-gray-500',    Icon: ShieldOff },
  VOIDED:  { label: 'ยกเลิกแล้ว',    cls: 'bg-red-100 text-red-600',      Icon: ShieldOff },
  CLAIMED: { label: 'ใช้สิทธิ์แล้ว', cls: 'bg-amber-100 text-amber-700',  Icon: ShieldAlert },
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function CustomerProfilePage() {
  const { id }   = useParams<{ id: string }>()
  const router   = useRouter()
  const qc       = useQueryClient()

  const [tab, setTab]           = useState<Tab>('sales')
  const [editOpen, setEditOpen] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [newTag, setNewTag]     = useState('')
  const tagInputRef = useRef<HTMLInputElement>(null)

  const { data: customer, isLoading } = useQuery<CustomerDetail>({
    queryKey: ['customers', id],
    queryFn:  async () => (await api.get(`/customers/${id}`)).data,
    enabled:  !!id,
  })

  const { data: warrantiesData } = useQuery({
    queryKey: ['customer-warranties', id],
    queryFn:  async () => (await api.get(`/warranties`, { params: { customerId: id, limit: 50 } })).data as {
      items: Warranty[]; total: number
    },
    enabled: !!id,
  })
  const warranties = warrantiesData?.items ?? []

  const addNote = useMutation({
    mutationFn: (note: string) => api.post(`/customers/${id}/notes`, { note }),
    onSuccess: () => {
      setNoteText('')
      qc.invalidateQueries({ queryKey: ['customers', id] })
      toast.success('บันทึกโน้ตแล้ว')
    },
    onError: () => toast.error('ไม่สามารถบันทึกโน้ตได้'),
  })

  const updateTags = useMutation({
    mutationFn: (tags: string[]) =>
      api.patch(`/customers/${id}/tags`, { tags }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', id] }),
    onError:   () => toast.error('ไม่สามารถอัพเดทแท็กได้'),
  })

  function handleAddTag() {
    const tag = newTag.trim()
    if (!tag || !customer) return
    if (customer.tags.includes(tag)) { setNewTag(''); return }
    updateTags.mutate([...customer.tags, tag])
    setNewTag('')
    tagInputRef.current?.focus()
  }

  function handleRemoveTag(tag: string) {
    if (!customer) return
    updateTags.mutate(customer.tags.filter((t) => t !== tag))
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>กำลังโหลด...</span>
      </div>
    )
  }

  if (!customer) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-muted-foreground">ไม่พบข้อมูลลูกค้า</p>
        <Button variant="outline" onClick={() => router.push('/customers')}>
          กลับ
        </Button>
      </div>
    )
  }

  const tier    = getTier(customer._count.sales, customer.totalSpending)
  const { label: tierLabel, Icon: TierIcon, cls: tierCls } = TIER_CONFIG[tier]

  // Initials avatar
  const initials = customer.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-8">
      {/* Back + actions */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/customers"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          ลูกค้า
        </Link>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() => setEditOpen(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
          แก้ไข
        </Button>
      </div>

      {/* Profile header */}
      <div className="bg-white rounded-xl border p-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="h-14 w-14 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{customer.name}</h1>
              <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tierCls}`}>
                <TierIcon className="h-3 w-3" />
                {tierLabel}
              </span>
              {customer.points > 0 && (
                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
                  {customer.points} คะแนน
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-col gap-1">
              {customer.phone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {customer.phone}
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {customer.email}
                </div>
              )}
              {customer.address && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{customer.address}</span>
                </div>
              )}
              {customer.note && (
                <div className="flex items-start gap-2 text-sm text-gray-500 border-t pt-2 mt-1">
                  <User className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{customer.note}</span>
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-2">
              สมัครเมื่อ {format(new Date(customer.createdAt), 'dd MMMM yyyy', { locale: th })}
            </p>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <p className="text-xs text-muted-foreground">ยอดซื้อรวม</p>
          </div>
          <p className="text-lg font-bold text-blue-700 tabular-nums">
            {formatThaiMoney(customer.totalSpending)}
          </p>
        </div>

        {customer.unpaidBalance > 0 && (
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="h-4 w-4 text-red-500" />
              <p className="text-xs text-red-600">ค้างชำระ</p>
            </div>
            <p className="text-lg font-bold text-red-700 tabular-nums">
              {formatThaiMoney(customer.unpaidBalance)}
            </p>
          </div>
        )}

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="h-4 w-4 text-green-500" />
            <p className="text-xs text-muted-foreground">ซื้อสินค้า</p>
          </div>
          <p className="text-lg font-bold tabular-nums">
            {customer._count.sales}
            <span className="text-xs font-normal text-muted-foreground ml-1">ครั้ง</span>
          </p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wrench className="h-4 w-4 text-purple-500" />
            <p className="text-xs text-muted-foreground">งานซ่อม</p>
          </div>
          <p className="text-lg font-bold tabular-nums">
            {customer._count.repairs}
            <span className="text-xs font-normal text-muted-foreground ml-1">งาน</span>
          </p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <p className="text-xs text-muted-foreground">เยี่ยมล่าสุด</p>
          </div>
          <p className="text-sm font-semibold text-gray-800">
            {customer.lastVisitAt
              ? formatDistanceToNow(new Date(customer.lastVisitAt), {
                  addSuffix: true, locale: th,
                })
              : '—'}
          </p>
        </div>

        <div className="bg-white rounded-xl border p-4">
          <div className="flex items-center gap-2 mb-1">
            <StickyNote className="h-4 w-4 text-slate-500" />
            <p className="text-xs text-muted-foreground">โน้ต</p>
          </div>
          <p className="text-lg font-bold tabular-nums">
            {customer.notes.length}
            <span className="text-xs font-normal text-muted-foreground ml-1">รายการ</span>
          </p>
        </div>
      </div>

      {/* Tags */}
      <div className="bg-white rounded-xl border p-4">
        <div className="flex items-center gap-2 mb-3">
          <Tag className="h-4 w-4 text-slate-500" />
          <p className="text-sm font-semibold text-gray-900">แท็ก</p>
        </div>
        <div className="flex flex-wrap gap-2 mb-3">
          {customer.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                className="text-slate-400 hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          {customer.tags.length === 0 && (
            <span className="text-xs text-muted-foreground">ยังไม่มีแท็ก</span>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            ref={tagInputRef}
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag() } }}
            placeholder="เพิ่มแท็กใหม่..."
            className="h-8 text-sm max-w-[200px]"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleAddTag}
            disabled={!newTag.trim() || updateTags.isPending}
            className="h-8 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            เพิ่ม
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl border overflow-hidden">
        {/* Tab bar */}
        <div className="flex border-b">
          {([
            { key: 'sales',      label: 'ประวัติการซื้อ', Icon: ShoppingCart, count: customer._count.sales },
            { key: 'repairs',   label: 'ประวัติซ่อม',   Icon: Wrench,        count: customer._count.repairs },
            { key: 'notes',     label: 'บันทึก',         Icon: StickyNote,   count: customer.notes.length },
            { key: 'warranties',label: 'ประกัน',          Icon: BadgeCheck,   count: warranties.length },
          ] as const).map(({ key, label, Icon, count }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={[
                'flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                tab === key
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-muted-foreground hover:text-gray-900',
              ].join(' ')}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === key ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-4">

          {/* ── Sales tab ── */}
          {tab === 'sales' && (
            customer.sales.length === 0 ? (
              <EmptyTabState icon={ShoppingCart} message="ยังไม่มีประวัติการซื้อ" />
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500">
                      <th className="text-left px-4 py-2 font-medium">เลขใบเสร็จ</th>
                      <th className="text-left px-4 py-2 font-medium">สถานะ</th>
                      <th className="text-left px-4 py-2 font-medium">วิธีชำระ</th>
                      <th className="text-right px-4 py-2 font-medium">ยอด</th>
                      <th className="text-left px-4 py-2 font-medium">วันที่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.sales.map((sale) => (
                      <tr key={sale.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-semibold text-blue-700 text-xs">
                          {sale.receiptNumber}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${SALE_STATUS_COLOR[sale.status] ?? 'bg-gray-100 text-gray-700'}`}>
                            {SALE_STATUS_LABEL[sale.status] ?? sale.status}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">
                          {sale.paymentMethod === 'CASH' ? 'เงินสด'
                            : sale.paymentMethod === 'TRANSFER' ? 'โอน'
                            : sale.paymentMethod}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-gray-900 text-sm">
                          {formatThaiMoney(Number(sale.total))}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(sale.createdAt), 'dd MMM yy HH:mm', { locale: th })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {customer._count.sales > 30 && (
                  <p className="px-4 py-2 text-xs text-center text-muted-foreground border-t">
                    แสดง 30 รายการล่าสุด จาก {customer._count.sales} รายการทั้งหมด
                  </p>
                )}
              </div>
            )
          )}

          {/* ── Repairs tab ── */}
          {tab === 'repairs' && (
            customer.repairs.length === 0 ? (
              <EmptyTabState icon={Wrench} message="ยังไม่มีประวัติงานซ่อม" />
            ) : (
              <div className="overflow-x-auto -mx-4">
                <table className="w-full text-sm min-w-[480px]">
                  <thead>
                    <tr className="border-b bg-gray-50 text-xs text-gray-500">
                      <th className="text-left px-4 py-2 font-medium">เลขงาน</th>
                      <th className="text-left px-4 py-2 font-medium">อุปกรณ์</th>
                      <th className="text-left px-4 py-2 font-medium">สถานะ</th>
                      <th className="text-right px-4 py-2 font-medium">ราคา</th>
                      <th className="text-left px-4 py-2 font-medium">วันที่รับ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customer.repairs.map((r) => (
                      <tr key={r.id} className="border-b last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-2.5 font-mono font-semibold text-blue-700 text-xs">
                          {r.ticketNumber}
                        </td>
                        <td className="px-4 py-2.5 text-gray-900 text-xs">
                          {r.deviceBrand} {r.deviceModel}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${REPAIR_STATUS_COLOR[r.status] ?? 'bg-gray-100 text-gray-700'}`}>
                              {REPAIR_STATUS_LABEL[r.status] ?? r.status}
                            </span>
                            {r.paymentStatus === 'PENDING' && r.status === 'DELIVERED' && (
                              <span className="rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-medium">
                                ค้างชำระ
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-sm font-semibold text-gray-900">
                          {r.finalCost ? formatThaiMoney(Number(r.finalCost)) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(r.receivedAt), 'dd MMM yy', { locale: th })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {customer._count.repairs > 30 && (
                  <p className="px-4 py-2 text-xs text-center text-muted-foreground border-t">
                    แสดง 30 รายการล่าสุด จาก {customer._count.repairs} รายการทั้งหมด
                  </p>
                )}
              </div>
            )
          )}

          {/* ── Warranties tab ── */}
          {tab === 'warranties' && (
            warranties.length === 0 ? (
              <EmptyTabState icon={BadgeCheck} message="ยังไม่มีการรับประกัน" />
            ) : (
              <div className="space-y-2">
                {warranties.map((w) => {
                  const { label, cls, Icon } = WARRANTY_STATUS_CONFIG[w.status]
                  return (
                    <div key={w.id} className="rounded-lg border bg-gray-50 p-3 flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-xs font-semibold text-gray-600">{w.warrantyNumber}</p>
                        {w.repair && (
                          <p className="text-sm font-medium text-blue-700">{w.repair.ticketNumber} — {w.repair.deviceBrand} {w.repair.deviceModel}</p>
                        )}
                        {w.saleItem && (
                          <p className="text-sm font-medium">{w.saleItem.product.name} ({w.saleItem.sale.receiptNumber})</p>
                        )}
                        {w.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{w.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(w.startDate), 'dd/MM/yy', { locale: th })}
                          {' → '}
                          {format(new Date(w.endDate), 'dd/MM/yy', { locale: th })}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0 ${cls}`}>
                        <Icon className="h-3 w-3" />
                        {label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          )}

          {/* ── Notes tab ── */}
          {tab === 'notes' && (
            <div className="space-y-4">
              {/* Add note form */}
              <div className="space-y-2">
                <Textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="เพิ่มบันทึกสำหรับลูกค้านี้..."
                  rows={3}
                  className="text-sm resize-none"
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => {
                      if (noteText.trim()) addNote.mutate(noteText.trim())
                    }}
                    disabled={!noteText.trim() || addNote.isPending}
                    className="gap-1.5"
                  >
                    {addNote.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <MessageSquarePlus className="h-3.5 w-3.5" />
                    )}
                    บันทึกโน้ต
                  </Button>
                </div>
              </div>

              {/* Notes list */}
              {customer.notes.length === 0 ? (
                <EmptyTabState icon={StickyNote} message="ยังไม่มีบันทึก" />
              ) : (
                <div className="space-y-3">
                  {customer.notes.map((note) => (
                    <div
                      key={note.id}
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                        {note.note}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                        {note.createdByName && (
                          <>
                            <User className="h-3 w-3" />
                            <span>{note.createdByName}</span>
                            <span>·</span>
                          </>
                        )}
                        <span title={format(new Date(note.createdAt), 'dd/MM/yyyy HH:mm', { locale: th })}>
                          {formatDistanceToNow(new Date(note.createdAt), { addSuffix: true, locale: th })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit dialog */}
      <CustomerFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        initialData={customer}
        onSuccess={() => {
          setEditOpen(false)
          qc.invalidateQueries({ queryKey: ['customers', id] })
          qc.invalidateQueries({ queryKey: ['customers'] })
        }}
      />
    </div>
  )
}

function EmptyTabState({
  icon: Icon,
  message,
}: {
  icon: React.ElementType
  message: string
}) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
      <Icon className="h-8 w-8 opacity-20" />
      <p className="text-sm">{message}</p>
    </div>
  )
}
