'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Plus, Search, ShieldCheck, Loader2, AlertTriangle, CheckCircle2,
  XCircle, Clock, ArrowRight, PackageCheck, RotateCcw, Banknote,
  ChevronRight, User, Calendar, Receipt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { formatThaiMoney } from '@/lib/utils'
import api from '@/lib/api'
import type { Claim, ClaimStatus, ClaimType, SerialNumber } from '@/types'

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<ClaimStatus, { label: string; cls: string; icon: React.ElementType }> = {
  OPEN:           { label: 'เปิดเคลม',      cls: 'bg-yellow-100 text-yellow-700 border-yellow-200',  icon: AlertTriangle },
  CHECKING:       { label: 'กำลังตรวจสอบ', cls: 'bg-blue-100 text-blue-700 border-blue-200',        icon: Search },
  SENT_SUPPLIER:  { label: 'ส่งซัพฯแล้ว',  cls: 'bg-indigo-100 text-indigo-700 border-indigo-200', icon: ArrowRight },
  WAITING_RESULT: { label: 'รอผล',          cls: 'bg-purple-100 text-purple-700 border-purple-200',  icon: Clock },
  APPROVED:       { label: 'อนุมัติ',       cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  REJECTED:       { label: 'ปฏิเสธ',       cls: 'bg-red-100 text-red-700 border-red-200',           icon: XCircle },
  REPLACED:       { label: 'เปลี่ยนแล้ว',  cls: 'bg-teal-100 text-teal-700 border-teal-200',        icon: PackageCheck },
  RETURNED:       { label: 'คืนสินค้า',    cls: 'bg-orange-100 text-orange-700 border-orange-200',  icon: RotateCcw },
  CLOSED:         { label: 'ปิดเคลม',      cls: 'bg-slate-100 text-slate-600 dark:text-slate-400 border-gray-300',        icon: CheckCircle2 },
  CANCELLED:      { label: 'ยกเลิก',       cls: 'bg-slate-100 text-slate-400 dark:text-slate-500 border-gray-200',        icon: XCircle },
}

const TYPE_CFG: Record<ClaimType, { label: string; cls: string }> = {
  SHOP:     { label: 'ประกันร้าน',   cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  BRAND:    { label: 'ประกันศูนย์', cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  SUPPLIER: { label: 'คืนซัพฯ',     cls: 'bg-orange-50 text-orange-700 border-orange-200' },
}

const NEXT_STATUSES: Record<ClaimStatus, ClaimStatus[]> = {
  OPEN:           ['CHECKING', 'CANCELLED'],
  CHECKING:       ['SENT_SUPPLIER', 'APPROVED', 'REJECTED', 'CANCELLED'],
  SENT_SUPPLIER:  ['WAITING_RESULT', 'APPROVED', 'CANCELLED'],
  WAITING_RESULT: ['APPROVED', 'REJECTED'],
  APPROVED:       ['REPLACED', 'RETURNED'],
  REPLACED:       ['CLOSED'],
  RETURNED:       ['CLOSED'],
  REJECTED:       ['CLOSED'],
  CLOSED:         [],
  CANCELLED:      [],
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const cfg = STATUS_CFG[status]
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  )
}

function TypeBadge({ type }: { type: ClaimType }) {
  const cfg = TYPE_CFG[type]
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

function WarrantyInfo({ warrantyExpiresAt }: { warrantyExpiresAt?: string }) {
  if (!warrantyExpiresAt) return <span className="text-slate-400 dark:text-slate-500 text-xs">ไม่มีประกัน</span>
  const exp = new Date(warrantyExpiresAt)
  const now = new Date()
  const expired = exp < now
  const daysLeft = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return (
    <span className={`text-xs font-medium ${expired ? 'text-red-500' : 'text-emerald-600'}`}>
      {expired
        ? `หมดประกันแล้ว (${exp.toLocaleDateString('th-TH')})`
        : `ในประกัน · เหลือ ${daysLeft} วัน`}
    </span>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

interface ClaimsResponse { total: number; page: number; limit: number; items: Claim[] }
interface StatsResponse { byStatus: Record<string, number>; totalClaimCost: number; pendingClaimCost: number }

export default function ClaimsPage() {
  const queryClient = useQueryClient()

  const [search,       setSearch]       = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [typeFilter,   setTypeFilter]   = useState('ALL')
  const [createOpen,   setCreateOpen]   = useState(false)
  const [detailClaim,  setDetailClaim]  = useState<Claim | null>(null)

  const params: Record<string, string> = { limit: '100' }
  if (search)                params.search    = search
  if (statusFilter !== 'ALL') params.status   = statusFilter
  if (typeFilter   !== 'ALL') params.claimType = typeFilter

  const { data, isLoading } = useQuery<ClaimsResponse>({
    queryKey: ['claims', params],
    queryFn: async () => (await api.get('/claims', { params })).data,
    staleTime: 0,
  })
  const { data: stats } = useQuery<StatsResponse>({
    queryKey: ['claims-stats'],
    queryFn: async () => (await api.get('/claims/stats')).data,
    staleTime: 30_000,
  })

  const claims = data?.items ?? []
  const total  = data?.total ?? 0

  const openCount    = stats?.byStatus['OPEN'] ?? 0
  const pendingCount = (['CHECKING','SENT_SUPPLIER','WAITING_RESULT','APPROVED'] as ClaimStatus[])
    .reduce((s, k) => s + (stats?.byStatus[k] ?? 0), 0)

  return (
    <div className="space-y-6 max-w-7xl">
      <PageHeader
        title="จัดการเคลม"
        icon={ShieldCheck}
        subtitle="ติดตามและจัดการเคลมประกันสินค้า"
        primaryAction={
          <Button onClick={() => setCreateOpen(true)} className="shrink-0 gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">สร้างเคลมใหม่</span>
            <span className="sm:hidden">สร้าง</span>
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'เปิดเคลมใหม่',    value: openCount,    cls: 'border-yellow-200', vcls: 'text-yellow-600' },
          { label: 'กำลังดำเนินการ', value: pendingCount, cls: 'border-blue-200',   vcls: 'text-blue-600' },
          { label: 'ต้นทุนเคลม (รวม)', value: formatThaiMoney(stats?.totalClaimCost ?? 0), cls: 'border-red-200', vcls: 'text-red-600' },
          { label: 'ต้นทุนค้างอยู่',  value: formatThaiMoney(stats?.pendingClaimCost ?? 0), cls: 'border-orange-200', vcls: 'text-orange-600' },
        ].map((s) => (
          <Card key={s.label} className={`border ${s.cls}`}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.vcls}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="ค้นหา เลขเคลม / IMEI / ชื่อลูกค้า / เบอร์..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44"><SelectValue placeholder="ทุกสถานะ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ทุกสถานะ</SelectItem>
            {(Object.keys(STATUS_CFG) as ClaimStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="ทุกประเภท" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">ทุกประเภท</SelectItem>
            {(Object.keys(TYPE_CFG) as ClaimType[]).map((t) => (
              <SelectItem key={t} value={t}>{TYPE_CFG[t].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : claims.length === 0 ? (
            <EmptyState preset={search || statusFilter !== 'ALL' || typeFilter !== 'ALL' ? 'search' : 'default'} icon={ShieldCheck} title="ไม่พบรายการเคลม" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40">
                    {['เลขเคลม','Serial / IMEI','สินค้า','ลูกค้า','ประเภท','สถานะ','ต้นทุน','วันที่',''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 font-medium text-muted-foreground">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {claims.map((c) => {
                    const exp = c.serialNumber.warrantyExpiresAt
                    const inWarranty = exp ? new Date(exp) > new Date() : false
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 cursor-pointer transition-colors" onClick={() => setDetailClaim(c)}>
                        <td className="px-4 py-3 font-mono font-medium text-blue-700">{c.claimNumber}</td>
                        <td className="px-4 py-3 font-mono text-xs">{c.serialNumber.serial}</td>
                        <td className="px-4 py-3">
                          <p className="font-medium truncate max-w-[140px]">{c.serialNumber.product.name}</p>
                          <p className="text-xs text-muted-foreground">{c.serialNumber.product.sku}</p>
                        </td>
                        <td className="px-4 py-3">
                          {c.customer ? (
                            <>
                              <p className="font-medium">{c.customer.name}</p>
                              <p className="text-xs text-muted-foreground">{c.customer.phone ?? '—'}</p>
                            </>
                          ) : <span className="text-muted-foreground text-xs">ไม่ระบุ</span>}
                        </td>
                        <td className="px-4 py-3"><TypeBadge type={c.claimType} /></td>
                        <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {c.claimCost ? <span className="text-red-600 font-medium">{formatThaiMoney(Number(c.claimCost))}</span> : <span className="text-muted-foreground">—</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('th-TH')}</td>
                        <td className="px-4 py-3"><ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500" /></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="px-4 py-3 border-t text-xs text-muted-foreground">แสดง {claims.length} จาก {total} รายการ</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateClaimDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={(claim) => {
          queryClient.invalidateQueries({ queryKey: ['claims'] })
          queryClient.invalidateQueries({ queryKey: ['claims-stats'] })
          queryClient.invalidateQueries({ queryKey: ['serials'] })
          setCreateOpen(false)
          setDetailClaim(claim)
          toast.success(`สร้างเคลม ${claim.claimNumber} เรียบร้อย`)
        }}
      />

      {detailClaim && (
        <ClaimDetailDialog
          claimId={detailClaim.id}
          onClose={() => setDetailClaim(null)}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ['claims'] })
            queryClient.invalidateQueries({ queryKey: ['claims-stats'] })
            queryClient.invalidateQueries({ queryKey: ['serials'] })
          }}
        />
      )}
    </div>
  )
}

// ─── Create Claim Dialog ──────────────────────────────────────────────────────

function CreateClaimDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSuccess: (claim: Claim) => void
}) {
  const [step, setStep]           = useState<'search' | 'form'>('search')
  const [query, setQuery]         = useState('')
  const [foundSerial, setFoundSerial] = useState<SerialNumber | null>(null)
  const [searchErr, setSearchErr] = useState('')
  const [searching, setSearching] = useState(false)
  const [claimType, setClaimType] = useState<ClaimType>('SHOP')
  const [symptom,   setSymptom]   = useState('')
  const [note,      setNote]      = useState('')

  useEffect(() => {
    if (open) { setStep('search'); setQuery(''); setFoundSerial(null); setSearchErr(''); setSymptom(''); setNote(''); setClaimType('SHOP') }
  }, [open])

  async function handleSearch() {
    if (!query.trim()) return
    setSearching(true)
    setSearchErr('')
    setFoundSerial(null)
    try {
      const res = await api.get<SerialNumber>('/serials/lookup', { params: { serial: query.trim() } })
      const s = res.data
      if (s.status !== 'SOLD') {
        setSearchErr(`Serial "${s.serial}" ไม่อยู่ในสถานะที่เคลมได้ (สถานะ: ${s.status})`)
      } else {
        setFoundSerial(s)
      }
    } catch (err: any) {
      setSearchErr(err.response?.data?.message ?? 'ไม่พบ Serial นี้ในระบบ')
    } finally {
      setSearching(false)
    }
  }

  const createMutation = useMutation({
    mutationFn: () =>
      api.post<Claim>('/claims', {
        serialNumberId: foundSerial!.id,
        claimType,
        symptom: symptom.trim(),
        note: note.trim() || undefined,
      }),
    onSuccess: (res) => onSuccess(res.data),
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  const exp = foundSerial?.warrantyExpiresAt
  const inWarranty = exp ? new Date(exp) > new Date() : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>สร้างเคลมใหม่</DialogTitle>
        </DialogHeader>

        {step === 'search' ? (
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>ค้นหา Serial / IMEI <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Input
                  placeholder="กรอก IMEI หรือ Serial..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  className="font-mono"
                />
                <Button onClick={handleSearch} disabled={searching || !query.trim()}>
                  {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {searchErr && (
                <p className="text-xs text-red-500 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{searchErr}
                </p>
              )}
            </div>

            {foundSerial && (
              <div className="rounded-xl border p-4 space-y-3 bg-blue-50/50 border-blue-100">
                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">พบสินค้า</p>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
                    <div>
                      <p className="font-semibold">{foundSerial.product?.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{foundSerial.serial}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="rounded-lg bg-white border p-2.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Calendar className="h-3 w-3" />ขายเมื่อ</p>
                      <p className="text-xs font-medium">
                        {foundSerial.soldAt ? new Date(foundSerial.soldAt).toLocaleDateString('th-TH') : '—'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white border p-2.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><ShieldCheck className="h-3 w-3" />ประกัน</p>
                      <WarrantyInfo warrantyExpiresAt={foundSerial.warrantyExpiresAt} />
                    </div>
                    {foundSerial.saleItem?.sale && (
                      <div className="rounded-lg bg-white border p-2.5 col-span-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><Receipt className="h-3 w-3" />ใบเสร็จ</p>
                        <p className="text-xs font-mono font-medium">{foundSerial.saleItem.sale.receiptNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
              <Button disabled={!foundSerial} onClick={() => setStep('form')}>
                ถัดไป →
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Summary */}
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 text-sm">
              <p className="font-semibold">{foundSerial?.product?.name}</p>
              <p className="text-xs font-mono text-muted-foreground">{foundSerial?.serial}</p>
              <div className="mt-1"><WarrantyInfo warrantyExpiresAt={foundSerial?.warrantyExpiresAt} /></div>
            </div>

            <div className="space-y-1.5">
              <Label>ประเภทเคลม <span className="text-red-500">*</span></Label>
              <Select value={claimType} onValueChange={(v) => setClaimType(v as ClaimType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_CFG) as ClaimType[]).map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_CFG[t].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>อาการเสีย <span className="text-red-500">*</span></Label>
              <textarea
                className="w-full rounded-lg border border-gray-200 p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="บรรยายอาการเสียของสินค้า..."
                value={symptom}
                onChange={(e) => setSymptom(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>หมายเหตุ</Label>
              <Input placeholder="ไม่บังคับ" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('search')}>← ย้อนกลับ</Button>
              <Button
                disabled={!symptom.trim() || createMutation.isPending}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                สร้างเคลม
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Claim Detail Dialog ──────────────────────────────────────────────────────

function ClaimDetailDialog({
  claimId,
  onClose,
  onUpdated,
}: {
  claimId: string
  onClose: () => void
  onUpdated: () => void
}) {
  const [updateOpen, setUpdateOpen] = useState(false)

  const { data: claim, isLoading, refetch } = useQuery<Claim>({
    queryKey: ['claims', claimId],
    queryFn: async () => (await api.get(`/claims/${claimId}`)).data,
    staleTime: 0,
  })

  const nextStatuses = claim ? NEXT_STATUSES[claim.status] : []
  const isTerminal   = nextStatuses.length === 0

  const updateMutation = useMutation({
    mutationFn: (dto: {
      claimCost?: number
      note?: string
    }) => api.patch<Claim>(`/claims/${claimId}`, dto),
    onSuccess: () => { refetch(); onUpdated(); toast.success('อัปเดตเรียบร้อย') },
    onError: (err: any) => toast.error(err.response?.data?.message ?? 'เกิดข้อผิดพลาด'),
  })

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        {isLoading || !claim ? (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground font-mono mb-1">{claim.claimNumber}</p>
                  <DialogTitle className="text-lg">{claim.serialNumber.product.name}</DialogTitle>
                  <p className="text-sm font-mono text-muted-foreground mt-0.5">{claim.serialNumber.serial}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge status={claim.status} />
                  <TypeBadge type={claim.claimType} />
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 pt-2">
              {/* Info grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Warranty */}
                <div className="rounded-xl border p-3 space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ประกัน</p>
                  <WarrantyInfo warrantyExpiresAt={claim.serialNumber.warrantyExpiresAt} />
                  {claim.serialNumber.soldAt && (
                    <p className="text-xs text-muted-foreground">
                      ขายเมื่อ {new Date(claim.serialNumber.soldAt).toLocaleDateString('th-TH')}
                    </p>
                  )}
                  {claim.serialNumber.saleItem?.sale && (
                    <p className="text-xs font-mono text-muted-foreground">
                      ใบเสร็จ: {claim.serialNumber.saleItem.sale.receiptNumber}
                    </p>
                  )}
                </div>

                {/* Customer */}
                <div className="rounded-xl border p-3 space-y-1">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">ลูกค้า</p>
                  {claim.customer ? (
                    <>
                      <p className="text-sm font-semibold flex items-center gap-1"><User className="h-3.5 w-3.5" />{claim.customer.name}</p>
                      {claim.customer.phone && <p className="text-xs text-muted-foreground">{claim.customer.phone}</p>}
                      {claim.customer.email && <p className="text-xs text-muted-foreground">{claim.customer.email}</p>}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">ไม่ระบุลูกค้า</p>
                  )}
                </div>
              </div>

              {/* Symptom */}
              <div className="rounded-xl border p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">อาการเสีย</p>
                <p className="text-sm">{claim.symptom}</p>
                {claim.note && <p className="text-xs text-muted-foreground mt-1">{claim.note}</p>}
              </div>

              {/* Replacement serial */}
              {claim.replacementSerial && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-3">
                  <p className="text-xs font-semibold text-teal-700 uppercase tracking-wide mb-2">สินค้าทดแทน</p>
                  <p className="text-sm font-semibold">{claim.replacementSerial.product.name}</p>
                  <p className="text-xs font-mono text-muted-foreground">{claim.replacementSerial.serial}</p>
                </div>
              )}

              {/* Cost + edit */}
              <ClaimCostEditor
                claimCost={claim.claimCost}
                note={claim.note}
                isTerminal={isTerminal}
                onSave={(claimCost, note) => updateMutation.mutate({ claimCost, note })}
                isSaving={updateMutation.isPending}
              />

              {/* Update status action */}
              {!isTerminal && (
                <div>
                  <Button variant="outline" className="w-full" onClick={() => setUpdateOpen(true)}>
                    เปลี่ยนสถานะ → {nextStatuses.map((s) => STATUS_CFG[s].label).join(' / ')}
                  </Button>
                </div>
              )}

              {/* Timeline */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">ประวัติสถานะ</p>
                <div className="space-y-2">
                  {claim.history?.map((h, idx) => {
                    const cfg = STATUS_CFG[h.status]
                    const Icon = cfg.icon
                    return (
                      <div key={h.id} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full border ${cfg.cls}`}>
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                          {idx < (claim.history!.length - 1) && (
                            <div className="w-px flex-1 bg-slate-200 my-1" />
                          )}
                        </div>
                        <div className="pb-3 flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold">{cfg.label}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {new Date(h.createdAt).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })}
                            </span>
                          </div>
                          {h.note && <p className="text-xs text-muted-foreground mt-0.5">{h.note}</p>}
                          <p className="text-xs text-muted-foreground mt-0.5">โดย {h.createdBy.name}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>

      {updateOpen && claim && (
        <UpdateStatusDialog
          claim={claim}
          onClose={() => setUpdateOpen(false)}
          onSuccess={() => {
            setUpdateOpen(false)
            refetch()
            onUpdated()
          }}
        />
      )}
    </Dialog>
  )
}

// ─── Cost editor (inline) ─────────────────────────────────────────────────────

function ClaimCostEditor({
  claimCost,
  note,
  isTerminal,
  onSave,
  isSaving,
}: {
  claimCost?: number
  note?: string
  isTerminal: boolean
  onSave: (cost?: number, note?: string) => void
  isSaving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [cost,    setCost]    = useState(claimCost?.toString() ?? '')
  const [n,       setN]       = useState(note ?? '')

  if (!editing) {
    return (
      <div className="rounded-xl border p-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-muted-foreground">ต้นทุนเคลม</p>
          <p className={`text-base font-bold mt-0.5 ${claimCost ? 'text-red-600' : 'text-muted-foreground'}`}>
            {claimCost ? formatThaiMoney(Number(claimCost)) : '—'}
          </p>
        </div>
        {!isTerminal && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>แก้ไข</Button>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-xl border p-3 space-y-3">
      <p className="text-xs font-semibold">แก้ไขต้นทุนเคลม</p>
      <div className="flex gap-2 items-center">
        <Banknote className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input
          type="number" min="0" placeholder="0"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="h-8"
        />
        <span className="text-sm text-muted-foreground">บาท</span>
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={() => setEditing(false)}>ยกเลิก</Button>
        <Button size="sm" disabled={isSaving} onClick={() => {
          onSave(cost ? Number(cost) : undefined, n || undefined)
          setEditing(false)
        }}>บันทึก</Button>
      </div>
    </div>
  )
}

// ─── Update Status Dialog ─────────────────────────────────────────────────────

function UpdateStatusDialog({
  claim,
  onClose,
  onSuccess,
}: {
  claim: Claim
  onClose: () => void
  onSuccess: () => void
}) {
  const nextStatuses = NEXT_STATUSES[claim.status]
  const [newStatus,     setNewStatus]     = useState<ClaimStatus>(nextStatuses[0])
  const [note,          setNote]          = useState('')
  const [claimCost,     setClaimCost]     = useState('')
  const [replSerialId,  setReplSerialId]  = useState('')
  const [replSearch,    setReplSearch]    = useState('')
  const [availSerials,  setAvailSerials]  = useState<SerialNumber[]>([])
  const [loadingSerials,setLoadingSerials]= useState(false)

  const needsReplacement = newStatus === 'REPLACED'

  useEffect(() => {
    if (needsReplacement) {
      setLoadingSerials(true)
      api.get('/serials', { params: { productId: claim.serialNumber.productId, status: 'IN_STOCK', limit: 100 } })
        .then((r) => setAvailSerials(r.data.items))
        .finally(() => setLoadingSerials(false))
    }
  }, [needsReplacement, claim.serialNumber.productId])

  const filteredSerials = replSearch
    ? availSerials.filter((s) => s.serial.toLowerCase().includes(replSearch.toLowerCase()))
    : availSerials

  const mutation = useMutation({
    mutationFn: () =>
      api.patch<Claim>(`/claims/${claim.id}/status`, {
        status: newStatus,
        note: note.trim() || undefined,
        claimCost: claimCost ? Number(claimCost) : undefined,
        replacementSerialId: needsReplacement ? replSerialId : undefined,
      }),
    onSuccess: () => {
      toast.success(`เปลี่ยนสถานะเป็น ${STATUS_CFG[newStatus].label}`)
      onSuccess()
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      toast.error(Array.isArray(msg) ? msg[0] : msg)
    },
  })

  const canSubmit = !mutation.isPending && (!needsReplacement || !!replSerialId)

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>เปลี่ยนสถานะเคลม</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-3 text-sm">
            <p className="text-xs text-muted-foreground">สถานะปัจจุบัน</p>
            <div className="mt-1"><StatusBadge status={claim.status} /></div>
          </div>

          <div className="space-y-1.5">
            <Label>สถานะใหม่ <span className="text-red-500">*</span></Label>
            <Select value={newStatus} onValueChange={(v) => { setNewStatus(v as ClaimStatus); setReplSerialId('') }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {nextStatuses.map((s) => (
                  <SelectItem key={s} value={s}>{STATUS_CFG[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Replacement serial picker */}
          {needsReplacement && (
            <div className="space-y-2">
              <Label>Serial สินค้าทดแทน <span className="text-red-500">*</span></Label>
              <Input
                placeholder="ค้นหา Serial..."
                value={replSearch}
                onChange={(e) => setReplSearch(e.target.value)}
                className="h-8 text-sm"
              />
              {loadingSerials ? (
                <div className="flex justify-center py-3"><Loader2 className="h-5 w-5 animate-spin" /></div>
              ) : filteredSerials.length === 0 ? (
                <p className="text-sm text-center text-red-500 py-2">ไม่มี Serial IN_STOCK สำหรับสินค้านี้</p>
              ) : (
                <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto border rounded-lg p-2">
                  {filteredSerials.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setReplSerialId(s.id)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono border transition-all
                        ${replSerialId === s.id
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-700 dark:text-slate-300 border-gray-200 hover:border-teal-400'}`}
                    >
                      {s.serial}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>ต้นทุนเคลม (บาท)</Label>
            <Input
              type="number" min="0" placeholder="0"
              value={claimCost}
              onChange={(e) => setClaimCost(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>หมายเหตุ</Label>
            <Input placeholder="บันทึกเพิ่มเติม..." value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>ยกเลิก</Button>
          <Button disabled={!canSubmit} onClick={() => mutation.mutate()}>
            {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            ยืนยัน
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
