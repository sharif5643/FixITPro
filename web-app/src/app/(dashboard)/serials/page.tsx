'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  ShieldCheck,
  Loader2,
  Layers,
  X,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  PackageX,
} from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { SerialNumber, Product } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  IN_STOCK:  { label: 'พร้อมขาย',  icon: CheckCircle2, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  SOLD:      { label: 'ขายแล้ว',   icon: ShieldCheck,  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
  RETURNED:  { label: 'คืนแล้ว',   icon: RotateCcw,    cls: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  CLAIMED:   { label: 'เคลม',      icon: AlertTriangle,cls: 'bg-orange-100 text-orange-700 border-orange-200' },
  DEFECTIVE: { label: 'ชำรุด',     icon: PackageX,     cls: 'bg-red-100 text-red-700 border-red-200' },
}

const WARRANTY_LABEL: Record<string, string> = {
  NO_WARRANTY:    'ไม่มีประกัน',
  SHOP_WARRANTY:  'ประกันร้าน',
  BRAND_WARRANTY: 'ประกันศูนย์',
}

interface SerialsResponse {
  total: number
  page: number
  limit: number
  items: SerialNumber[]
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SerialsPage() {
  const queryClient = useQueryClient()

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [productFilter,setProductFilter]= useState('')
  const [addOpen,      setAddOpen]      = useState(false)
  const [bulkOpen,     setBulkOpen]     = useState(false)
  const [detailSerial, setDetailSerial] = useState<SerialNumber | null>(null)

  // Build query params
  const params: Record<string, string> = { limit: '100' }
  if (search)        params.search    = search
  if (statusFilter !== 'ALL') params.status = statusFilter
  if (productFilter) params.productId = productFilter

  const { data, isLoading } = useQuery<SerialsResponse>({
    queryKey: ['serials', params],
    queryFn: async () => (await api.get('/serials', { params })).data,
    staleTime: 0,
  })

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-serial'],
    queryFn: async () => (await api.get('/products', { params: { limit: 500 } })).data,
    staleTime: 60_000,
    select: (p) => p.filter((x: Product) => x.hasSerial),
  })

  const serials = data?.items ?? []
  const total   = data?.total ?? 0

  const statusCounts = serials.reduce<Record<string, number>>((acc, s) => {
    acc[s.status] = (acc[s.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="จัดการ Serial / IMEI"
        icon={ShieldCheck}
        subtitle="ติดตาม Serial และ IMEI ของสินค้า"
        secondaryActions={
          <Button variant="outline" size="sm" onClick={() => setBulkOpen(true)} className="gap-1.5">
            <Layers className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่มหลายรายการ</span>
          </Button>
        }
        primaryAction={
          <Button onClick={() => setAddOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">เพิ่ม Serial</span>
          </Button>
        }
      />

      {/* Status summary */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(STATUS_CFG).map(([key, cfg]) => {
          const Icon = cfg.icon
          const count = statusCounts[key] ?? 0
          return (
            <button
              key={key}
              onClick={() => setStatusFilter(statusFilter === key ? 'ALL' : key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all
                ${statusFilter === key ? cfg.cls + ' ring-2 ring-offset-1 ring-current' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'}`}
            >
              <Icon className="h-3.5 w-3.5" />
              {cfg.label} ({count})
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="ค้นหา Serial / IMEI..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={productFilter || '_all'} onValueChange={(v) => setProductFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-56">
            <SelectValue placeholder="ทุกสินค้า" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">ทุกสินค้า</SelectItem>
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : serials.length === 0 ? (
            <EmptyState
              preset={search || statusFilter !== 'ALL' || productFilter ? 'search' : 'default'}
              icon={ShieldCheck}
              title="ไม่พบ Serial"
              description="เพิ่ม Serial / IMEI สำหรับสินค้าที่ต้องการติดตาม"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Serial / IMEI</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">สินค้า</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">ประกัน</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">สถานะ</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">หมดประกัน</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">ใบเสร็จ</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {serials.map((s) => {
                    const cfg = STATUS_CFG[s.status] ?? STATUS_CFG.IN_STOCK
                    const Icon = cfg.icon
                    const isExpired = s.warrantyExpiresAt && new Date(s.warrantyExpiresAt) < new Date()
                    return (
                      <tr
                        key={s.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer transition-colors"
                        onClick={() => setDetailSerial(s)}
                      >
                        <td className="px-4 py-3 font-mono font-medium">{s.serial}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-900 dark:text-white">{s.product?.name}</p>
                          <p className="text-xs text-muted-foreground">{s.product?.sku}</p>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {s.product ? WARRANTY_LABEL[s.product.warrantyType] ?? '-' : '-'}
                          {s.product?.warrantyDays ? ` (${s.product.warrantyDays} วัน)` : ''}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
                            <Icon className="h-3 w-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {s.warrantyExpiresAt ? (
                            <span className={isExpired ? 'text-red-500 font-medium' : 'text-emerald-600'}>
                              {new Date(s.warrantyExpiresAt).toLocaleDateString('th-TH')}
                              {isExpired ? ' (หมดแล้ว)' : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-muted-foreground">
                          {s.saleItem?.sale.receiptNumber ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t text-xs text-muted-foreground">
                แสดง {serials.length} จาก {total} รายการ
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add single serial dialog */}
      <AddSerialDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        products={products}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['serials'] })
          setAddOpen(false)
          toast.success('เพิ่ม Serial เรียบร้อย')
        }}
      />

      {/* Bulk add dialog */}
      <BulkSerialDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        products={products}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['serials'] })
          setBulkOpen(false)
        }}
      />

      {/* Detail dialog */}
      {detailSerial && (
        <SerialDetailDialog
          serial={detailSerial}
          onClose={() => setDetailSerial(null)}
          onUpdated={(s) => {
            setDetailSerial(s)
            queryClient.invalidateQueries({ queryKey: ['serials'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Add Single Serial Dialog ─────────────────────────────────────────────────

function AddSerialDialog({
  open,
  onOpenChange,
  products,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  products: Product[]
  onSuccess: () => void
}) {
  const [productId, setProductId] = useState('')
  const [serial,    setSerial]    = useState('')
  const [note,      setNote]      = useState('')

  const mutation = useMutation({
    mutationFn: () => api.post('/serials', { productId, serial: serial.trim(), note: note.trim() || undefined }),
    onSuccess,
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  useEffect(() => {
    if (open) { setProductId(''); setSerial(''); setNote('') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่ม Serial / IMEI</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>สินค้า <span className="text-red-500">*</span></Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="เลือกสินค้า" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Serial / IMEI <span className="text-red-500">*</span></Label>
            <Input
              placeholder="กรอก Serial หรือ IMEI"
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              className="font-mono"
            />
          </div>
          <div className="space-y-1.5">
            <Label>หมายเหตุ</Label>
            <Input placeholder="ไม่บังคับ" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>ยกเลิก</Button>
          <Button
            disabled={!productId || !serial.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Bulk Add Dialog ──────────────────────────────────────────────────────────

function BulkSerialDialog({
  open,
  onOpenChange,
  products,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  products: Product[]
  onSuccess: () => void
}) {
  const [productId,  setProductId]  = useState('')
  const [serialsText,setSerialsText]= useState('')
  const [note,       setNote]       = useState('')

  const serials = serialsText
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)

  const mutation = useMutation({
    mutationFn: () => api.post('/serials/bulk', { productId, serials, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(`เพิ่ม ${serials.length} Serial เรียบร้อย`)
      onSuccess()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  useEffect(() => {
    if (open) { setProductId(''); setSerialsText(''); setNote('') }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เพิ่ม Serial หลายรายการ</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label>สินค้า <span className="text-red-500">*</span></Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger><SelectValue placeholder="เลือกสินค้า" /></SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Serial / IMEI <span className="text-red-500">*</span></Label>
            <textarea
              className="w-full rounded-lg border border-gray-200 p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={6}
              placeholder={'วางทีละบรรทัด หรือคั่นด้วย comma:\n356789012345678\n356789012345679\n356789012345680'}
              value={serialsText}
              onChange={(e) => setSerialsText(e.target.value)}
            />
            {serials.length > 0 && (
              <p className="text-xs text-blue-600 font-medium">{serials.length} Serial จะถูกเพิ่ม</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>หมายเหตุ</Label>
            <Input placeholder="ไม่บังคับ" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>ยกเลิก</Button>
          <Button
            disabled={!productId || serials.length === 0 || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            เพิ่ม {serials.length > 0 ? `${serials.length} รายการ` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Serial Detail / Edit Dialog ──────────────────────────────────────────────

function SerialDetailDialog({
  serial,
  onClose,
  onUpdated,
}: {
  serial: SerialNumber
  onClose: () => void
  onUpdated: (s: SerialNumber) => void
}) {
  const [status, setStatus] = useState(serial.status)
  const [note,   setNote]   = useState(serial.note ?? '')

  const cfg = STATUS_CFG[serial.status] ?? STATUS_CFG.IN_STOCK
  const isExpired = serial.warrantyExpiresAt && new Date(serial.warrantyExpiresAt) < new Date()

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<SerialNumber>(`/serials/${serial.id}`, {
        status: status !== serial.status ? status : undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: (res) => {
      toast.success('อัปเดต Serial เรียบร้อย')
      onUpdated(res.data)
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">{serial.serial}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Product info */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 space-y-1 text-sm">
            <p className="font-semibold">{serial.product?.name}</p>
            <p className="text-muted-foreground text-xs">{serial.product?.sku}</p>
            <p className="text-xs">
              {serial.product ? WARRANTY_LABEL[serial.product.warrantyType] : '—'}
              {serial.product?.warrantyDays ? ` · ${serial.product.warrantyDays} วัน` : ''}
            </p>
          </div>

          {/* Warranty & sale info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground mb-1">หมดประกัน</p>
              {serial.warrantyExpiresAt ? (
                <p className={`font-semibold ${isExpired ? 'text-red-500' : 'text-emerald-600'}`}>
                  {new Date(serial.warrantyExpiresAt).toLocaleDateString('th-TH')}
                  {isExpired && <span className="block text-xs font-normal">หมดแล้ว</span>}
                </p>
              ) : (
                <p className="text-muted-foreground">—</p>
              )}
            </div>
            <div className="rounded-xl border p-3">
              <p className="text-xs text-muted-foreground mb-1">ใบเสร็จ</p>
              <p className="font-mono text-xs font-medium">
                {serial.saleItem?.sale.receiptNumber ?? '—'}
              </p>
              {serial.soldAt && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {new Date(serial.soldAt).toLocaleDateString('th-TH')}
                </p>
              )}
            </div>
          </div>

          {/* Status edit — not allowed for SOLD/CLAIMED */}
          {serial.status !== 'SOLD' && serial.status !== 'CLAIMED' && (
            <div className="space-y-1.5">
              <Label>สถานะ</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_STOCK">พร้อมขาย</SelectItem>
                  <SelectItem value="RETURNED">คืนแล้ว</SelectItem>
                  <SelectItem value="DEFECTIVE">ชำรุด</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>หมายเหตุ</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ไม่บังคับ" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ปิด</Button>
          {serial.status !== 'SOLD' && serial.status !== 'CLAIMED' && (
            <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              บันทึก
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Required for useEffect in sub-components
import { useEffect } from 'react'
