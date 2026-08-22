'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, Users, ChevronRight, ArrowLeft, CheckCircle2, Info } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { apiErrorMessage } from '@/lib/utils'
import {
  getAcceptedPartners,
  createTransfer,
  type AcceptedPartnerRelationship,
} from '@/lib/partner-repair-transfers'
import { useAuthStore } from '@/store/auth.store'

interface Props {
  open: boolean
  onClose: () => void
  repair: {
    id: string
    ticketNumber: string
    deviceBrand: string
    deviceModel: string
    deviceColor?: string | null
    deviceImei?: string | null
    issue: string
    note?: string | null
  }
}

type Step = 'select-partner' | 'review-info' | 'price-note' | 'confirm'

export function SendToPartnerDialog({ open, onClose, repair }: Props) {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [step, setStep]   = useState<Step>('select-partner')
  const [selected, setSelected] = useState<AcceptedPartnerRelationship | null>(null)
  const [shareImei, setShareImei] = useState(false)
  const [note, setNote]   = useState('')
  const [price, setPrice] = useState('')

  const { data: partners = [], isLoading: loadingPartners } = useQuery({
    queryKey: ['partner-relationships', 'accepted'],
    queryFn:  getAcceptedPartners,
    enabled:  open,
    staleTime: 30_000,
  })

  const sendMutation = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error('ไม่ได้เลือกพาร์ทเนอร์')
      const myTenantId = user?.tenantId
      const partnerTenantId =
        selected.initiatorTenantId === myTenantId
          ? selected.partnerTenantId
          : selected.initiatorTenantId

      const sharedDeviceInfo: Record<string, unknown> = {
        deviceBrand: repair.deviceBrand,
        deviceModel: repair.deviceModel,
        ...(repair.deviceColor ? { deviceColor: repair.deviceColor } : {}),
        ...(shareImei && repair.deviceImei ? { deviceImei: repair.deviceImei } : {}),
        issue: repair.issue,
      }

      return createTransfer(repair.id, {
        partnerTenantId,
        relationshipId:     selected.id,
        agreedPartnerPrice: price ? Number(price) : undefined,
        pricingNote:        note.trim() || undefined,
        sharedDeviceInfo,
        partnerWorkNote:    note.trim() || undefined,
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partner-transfer', repair.id] })
      queryClient.invalidateQueries({ queryKey: ['partner-transfers'] })
      toast.success('ส่งงานให้พาร์ทเนอร์สำเร็จ')
      handleClose()
    },
    onError: (err: any) => toast.error(apiErrorMessage(err)),
  })

  function handleClose() {
    setStep('select-partner')
    setSelected(null)
    setShareImei(false)
    setNote('')
    setPrice('')
    onClose()
  }

  const myTenantId = user?.tenantId
  function partnerName(rel: AcceptedPartnerRelationship) {
    if (rel.initiatorTenantId === myTenantId) {
      return rel.partnerTenant?.shopName ?? rel.partnerTenantId
    }
    return rel.initiatorTenant?.shopName ?? rel.initiatorTenantId
  }

  const stepTitles: Record<Step, string> = {
    'select-partner': 'เลือกพาร์ทเนอร์',
    'review-info':    'ข้อมูลที่จะส่งให้พาร์ทเนอร์',
    'price-note':     'ราคาและหมายเหตุ',
    'confirm':        'ยืนยันส่งงาน',
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-indigo-600" />
            ส่งต่องานให้ Partner — {stepTitles[step]}
          </DialogTitle>
        </DialogHeader>

        {/* ── Step 1: Select partner ── */}
        {step === 'select-partner' && (
          <div className="space-y-3">
            {loadingPartners ? (
              <div className="flex items-center justify-center h-24 gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>กำลังโหลด...</span>
              </div>
            ) : partners.length === 0 ? (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-5 text-center">
                <p className="text-sm text-muted-foreground">ยังไม่มีพาร์ทเนอร์ที่ยืนยันแล้ว</p>
                <p className="text-xs text-muted-foreground mt-1">ไปที่ ตั้งค่า → พาร์ทเนอร์ เพื่อเพิ่มพาร์ทเนอร์</p>
              </div>
            ) : (
              <div className="space-y-2">
                {partners.map((rel) => (
                  <button
                    key={rel.id}
                    onClick={() => setSelected(rel)}
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-colors text-left ${
                      selected?.id === rel.id
                        ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 dark:border-indigo-600'
                        : 'border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {partnerName(rel)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">พาร์ทเนอร์ · ยืนยันแล้ว</p>
                    </div>
                    {selected?.id === rel.id && (
                      <CheckCircle2 className="h-5 w-5 text-indigo-600 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>ยกเลิก</Button>
              <Button
                onClick={() => setStep('review-info')}
                disabled={!selected}
                className="gap-1.5"
              >
                ถัดไป <ChevronRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 2: Review shared info ── */}
        {step === 'review-info' && (
          <div className="space-y-4">
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 p-4 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-400 uppercase tracking-wide mb-1">
                <Info className="h-3.5 w-3.5" />
                ข้อมูลที่จะแชร์ให้พาร์ทเนอร์
              </div>
              <Row label="ยี่ห้อ / รุ่น">{repair.deviceBrand} {repair.deviceModel}</Row>
              {repair.deviceColor && <Row label="สี">{repair.deviceColor}</Row>}
              <Row label="อาการ">{repair.issue}</Row>
            </div>

            {/* IMEI opt-in */}
            {repair.deviceImei && (
              <div className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">แชร์ IMEI / Serial</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{repair.deviceImei}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShareImei(!shareImei)}
                  className={`relative w-10 h-5 rounded-full transition-colors ${shareImei ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${shareImei ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            )}

            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                ข้อมูลลูกค้า (ชื่อ, เบอร์, ที่อยู่) ราคา และอะไหล่ ไม่ถูกส่งให้พาร์ทเนอร์
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select-partner')} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> ย้อนกลับ
              </Button>
              <Button onClick={() => setStep('price-note')} className="gap-1.5">
                ถัดไป <ChevronRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 3: Price + note ── */}
        {step === 'price-note' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                ราคาที่ตกลงกับพาร์ทเนอร์ (บาท) — ไม่บังคับ
              </label>
              <Input
                type="number"
                min={0}
                step={1}
                placeholder="ไม่ระบุ"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="h-11 text-lg font-bold tabular-nums"
              />
              <p className="text-xs text-muted-foreground">ราคานี้คือค่าจ้างพาร์ทเนอร์ ไม่ใช่ราคาที่คิดลูกค้า</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                หมายเหตุถึงพาร์ทเนอร์ — ไม่บังคับ
              </label>
              <Textarea
                placeholder="เช่น ช่วยตรวจจอให้หน่อยครับ ลูกค้าต้องการงานด่วน"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('review-info')} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> ย้อนกลับ
              </Button>
              <Button onClick={() => setStep('confirm')} className="gap-1.5">
                ถัดไป <ChevronRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step 4: Confirm ── */}
        {step === 'confirm' && selected && (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 p-4 space-y-2 text-sm">
              <Row label="พาร์ทเนอร์">{partnerName(selected)}</Row>
              <Row label="อุปกรณ์">{repair.deviceBrand} {repair.deviceModel}{repair.deviceColor ? ` (${repair.deviceColor})` : ''}</Row>
              {shareImei && repair.deviceImei && <Row label="IMEI">{repair.deviceImei}</Row>}
              {price && <Row label="ราคาพาร์ทเนอร์">฿{Number(price).toLocaleString()}</Row>}
              {note && <Row label="หมายเหตุ">{note}</Row>}
            </div>

            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 p-3">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                งานซ่อม {repair.ticketNumber} จะถูกส่งให้ <strong>{partnerName(selected)}</strong> พิจารณา
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('price-note')} disabled={sendMutation.isPending} className="gap-1.5">
                <ArrowLeft className="h-4 w-4" /> ย้อนกลับ
              </Button>
              <Button
                onClick={() => sendMutation.mutate()}
                disabled={sendMutation.isPending}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700"
              >
                {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />}
                ยืนยันส่งงาน
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground shrink-0 w-28">{label}</span>
      <span className="font-medium text-slate-900 dark:text-white">{children}</span>
    </div>
  )
}
