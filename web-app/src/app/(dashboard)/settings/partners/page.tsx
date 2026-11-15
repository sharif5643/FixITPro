'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  Users, Plus, CheckCircle2, XCircle, Clock,
  Ban, Loader2, ChevronRight, Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PageHeader } from '@/components/ui/page-header'
import { SectionCard } from '@/components/ui/section-card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { PartnerCodeCard } from '@/components/partner-repair/partner-code-card'

// ── Types ─────────────────────────────────────────────────────────────────────

type RelStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'SUSPENDED'

interface PartnerTenant {
  id:       string
  shopName: string
  phone?:   string | null
}

interface PartnerRelationship {
  id:                string
  status:            RelStatus
  note?:             string | null
  createdAt:         string
  respondedAt?:      string | null
  initiatorTenantId: string
  partnerTenantId:   string
  initiatorTenant:   PartnerTenant
  partnerTenant:     PartnerTenant
  requestedBy?:      { id: string; name: string } | null
  respondedBy?:      { id: string; name: string } | null
  suspendedAt?:      string | null
  /** this shop suspended it (only this shop can open it again) */
  suspendedByMe?:    boolean
}

// ── Status chip ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<RelStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ReactNode }> = {
  PENDING:   { label: 'รอตอบรับ', variant: 'secondary',    icon: <Clock    className="h-3 w-3" /> },
  ACCEPTED:  { label: 'ยอมรับแล้ว', variant: 'default',   icon: <CheckCircle2 className="h-3 w-3" /> },
  REJECTED:  { label: 'ปฏิเสธแล้ว', variant: 'destructive', icon: <XCircle  className="h-3 w-3" /> },
  CANCELLED: { label: 'ยกเลิก',   variant: 'outline',      icon: <Ban      className="h-3 w-3" /> },
  SUSPENDED: { label: 'ถูกระงับ', variant: 'destructive',  icon: <Ban      className="h-3 w-3" /> },
}

function StatusBadge({ status }: { status: RelStatus }) {
  const s = STATUS_MAP[status]
  return (
    <Badge variant={s.variant} className="flex items-center gap-1 text-xs">
      {s.icon}
      {s.label}
    </Badge>
  )
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  confirmVariant = 'default',
  onConfirm,
  onCancel,
}: {
  open:           boolean
  title:          string
  body:           string
  confirmLabel:   string
  confirmVariant?: 'default' | 'destructive'
  onConfirm:      () => void
  onCancel:       () => void
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{body}</p>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>ยกเลิก</Button>
          <Button variant={confirmVariant} onClick={onConfirm}>{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Relationship card ─────────────────────────────────────────────────────────

function RelationshipCard({
  rel,
  myTenantId,
  onAccept,
  onReject,
  onCancel,
  onSuspend,
  onResume,
  canManage = false,
  isLoading,
}: {
  rel:         PartnerRelationship
  myTenantId:  string
  onAccept:    (id: string) => void
  onReject:    (id: string) => void
  onCancel:    (id: string) => void
  onSuspend?:  (id: string) => void
  onResume?:   (id: string) => void
  canManage?:  boolean
  isLoading:   boolean
}) {
  const isInitiator = rel.initiatorTenantId === myTenantId
  const other = isInitiator ? rel.partnerTenant : rel.initiatorTenant

  return (
    <div className={cn(
      'flex items-center justify-between rounded-lg border bg-card px-4 py-3 gap-4',
      rel.status === 'ACCEPTED' && 'border-green-500/30 bg-green-50/30 dark:bg-green-900/10',
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <Building2 className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="font-medium text-sm truncate">{other.shopName}</p>
          {other.phone && (
            <p className="text-xs text-muted-foreground">{other.phone}</p>
          )}
          <p className="text-xs text-muted-foreground mt-0.5">
            {isInitiator ? 'คุณส่งคำขอ' : 'ส่งคำขอมาให้คุณ'}{' · '}
            {new Date(rel.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          {rel.status === 'SUSPENDED' && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
              {rel.suspendedByMe ? 'คุณระงับไว้' : 'ร้านนี้ระงับไว้'} — ส่งงานใหม่และเดินงานต่อไม่ได้ ส่งเครื่องคืนได้ตามปกติ
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <StatusBadge status={rel.status} />

        {/* Shop B actions on PENDING incoming requests */}
        {!isInitiator && rel.status === 'PENDING' && (
          <>
            <Button
              size="sm"
              variant="outline"
              className="text-red-600 border-red-200 hover:bg-red-50"
              disabled={isLoading}
              onClick={() => onReject(rel.id)}
            >
              ปฏิเสธ
            </Button>
            <Button
              size="sm"
              disabled={isLoading}
              onClick={() => onAccept(rel.id)}
            >
              ยอมรับ
            </Button>
          </>
        )}

        {/* Either shop can suspend an active partnership; only the shop that suspended can resume */}
        {canManage && rel.status === 'ACCEPTED' && onSuspend && (
          <Button size="sm" variant="ghost" className="text-red-600" disabled={isLoading} onClick={() => onSuspend(rel.id)}>
            ระงับ
          </Button>
        )}
        {canManage && rel.status === 'SUSPENDED' && rel.suspendedByMe && onResume && (
          <Button size="sm" variant="outline" disabled={isLoading} onClick={() => onResume(rel.id)}>
            เปิดใช้อีกครั้ง
          </Button>
        )}

        {/* Shop A can cancel own PENDING requests */}
        {isInitiator && rel.status === 'PENDING' && (
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground"
            disabled={isLoading}
            onClick={() => onCancel(rel.id)}
          >
            ยกเลิก
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PartnersSettingsPage() {
  const { user } = useAuthStore()
  const qc        = useQueryClient()
  const isOwner   = user?.role === 'OWNER'

  const [showSendDialog, setShowSendDialog] = useState(false)
  const [partnerEmail, setPartnerEmail]     = useState('')
  const [note, setNote]                     = useState('')
  const [confirmAction, setConfirmAction]   = useState<{
    type:  'accept' | 'reject' | 'cancel' | 'suspend' | 'resume'
    id:    string
    shop?: string
  } | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: relationships, isLoading } = useQuery<PartnerRelationship[]>({
    queryKey: ['partner-relationships'],
    queryFn:  () => api.get('/partner-relationships').then((r) => r.data),
    staleTime: 30_000,
    enabled:   !!user?.tenantId,
  })

  // ── Mutations ────────────────────────────────────────────────────────────

  const invalidate = () => qc.invalidateQueries({ queryKey: ['partner-relationships'] })

  const sendMutation = useMutation({
    mutationFn: (data: { partnerEmail: string; note?: string }) =>
      api.post('/partner-relationships', data).then((r) => r.data),
    onSuccess: () => {
      toast.success('ส่งคำขอพาร์ทเนอร์แล้ว')
      setShowSendDialog(false)
      setPartnerEmail('')
      setNote('')
      invalidate()
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.message ?? 'เกิดข้อผิดพลาด'
      toast.error(msg)
    },
  })

  const acceptMutation = useMutation({
    mutationFn: (id: string) => api.post(`/partner-relationships/${id}/accept`).then((r) => r.data),
    onSuccess: () => { toast.success('ยอมรับคำขอพาร์ทเนอร์แล้ว'); invalidate() },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  })

  const rejectMutation = useMutation({
    mutationFn: (id: string) => api.post(`/partner-relationships/${id}/reject`).then((r) => r.data),
    onSuccess: () => { toast.success('ปฏิเสธคำขอแล้ว'); invalidate() },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  })

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/partner-relationships/${id}/cancel`).then((r) => r.data),
    onSuccess: () => { toast.success('ยกเลิกคำขอแล้ว'); invalidate() },
    onError: () => toast.error('เกิดข้อผิดพลาด'),
  })

  const errMsg = (err: any) => err?.response?.data?.message ?? 'เกิดข้อผิดพลาด'
  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/partner-relationships/${id}/suspend`).then((r) => r.data),
    onSuccess: () => { toast.success('ระงับการส่งงานกับร้านนี้แล้ว'); invalidate() },
    onError: (err: any) => toast.error(errMsg(err)),
  })
  const resumeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/partner-relationships/${id}/resume`).then((r) => r.data),
    onSuccess: () => { toast.success('เปิดส่งงานกับร้านนี้อีกครั้งแล้ว'); invalidate() },
    onError: (err: any) => toast.error(errMsg(err)),
  })

  const anyLoading = acceptMutation.isPending || rejectMutation.isPending || cancelMutation.isPending
    || suspendMutation.isPending || resumeMutation.isPending

  // ── Confirm handlers ─────────────────────────────────────────────────────

  function handleConfirm() {
    if (!confirmAction) return
    const { type, id } = confirmAction
    if (type === 'accept') acceptMutation.mutate(id)
    else if (type === 'reject') rejectMutation.mutate(id)
    else if (type === 'cancel') cancelMutation.mutate(id)
    else if (type === 'suspend') suspendMutation.mutate(id)
    else if (type === 'resume') resumeMutation.mutate(id)
    setConfirmAction(null)
  }

  function openAccept(id: string) {
    const rel  = relationships?.find((r) => r.id === id)
    const shop = rel?.initiatorTenant?.shopName
    setConfirmAction({ type: 'accept', id, shop })
  }

  function openReject(id: string) {
    const rel  = relationships?.find((r) => r.id === id)
    const shop = rel?.initiatorTenant?.shopName
    setConfirmAction({ type: 'reject', id, shop })
  }

  function openCancel(id: string) {
    const rel  = relationships?.find((r) => r.id === id)
    const shop = rel?.partnerTenant?.shopName
    setConfirmAction({ type: 'cancel', id, shop })
  }

  const otherShop = (id: string) => {
    const rel = relationships?.find((r) => r.id === id)
    return rel ? (rel.initiatorTenantId === user?.tenantId ? rel.partnerTenant : rel.initiatorTenant)?.shopName : undefined
  }
  const openSuspend = (id: string) => setConfirmAction({ type: 'suspend', id, shop: otherShop(id) })
  const openResume  = (id: string) => setConfirmAction({ type: 'resume', id, shop: otherShop(id) })

  // ── Segment data ─────────────────────────────────────────────────────────

  const pending  = relationships?.filter((r) => r.status === 'PENDING')  ?? []
  // suspended partners stay in the main list: their jobs in hand are still being returned
  const accepted = relationships?.filter((r) => r.status === 'ACCEPTED' || r.status === 'SUSPENDED') ?? []
  const past     = relationships?.filter((r) => ['REJECTED', 'CANCELLED'].includes(r.status)) ?? []

  const incomingPending = pending.filter((r) => r.partnerTenantId === user?.tenantId)

  return (
    <div className="space-y-6">
      <PageHeader
        title="พาร์ทเนอร์"
        subtitle="จัดการความสัมพันธ์กับร้านซ่อมพาร์ทเนอร์"
        icon={Users}
        primaryAction={
          isOwner ? (
            <Button onClick={() => setShowSendDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              ส่งคำขอพาร์ทเนอร์
            </Button>
          ) : undefined
        }
      />

      {isOwner && <PartnerCodeCard />}

      {/* Incoming pending requests (Shop B) */}
      {incomingPending.length > 0 && (
        <SectionCard
          title={`คำขอที่รอตอบรับ (${incomingPending.length})`}
          description="คำขอจากร้านซ่อมที่ต้องการเป็นพาร์ทเนอร์กับคุณ"
        >
          <div className="space-y-2">
            {incomingPending.map((rel) => (
              <RelationshipCard
                key={rel.id}
                rel={rel}
                myTenantId={user?.tenantId ?? ''}
                onAccept={isOwner ? openAccept : () => {}}
                onReject={isOwner ? openReject : () => {}}
                onCancel={openCancel}
                isLoading={anyLoading}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Accepted partners */}
      <SectionCard
        title="พาร์ทเนอร์ที่ยอมรับแล้ว"
        description="ร้านซ่อมที่เป็นพาร์ทเนอร์กับคุณและสามารถรับงานซ่อมต่อได้"
      >
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> กำลังโหลด...
          </div>
        ) : accepted.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            <Building2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p>ยังไม่มีพาร์ทเนอร์</p>
            {isOwner && (
              <p className="mt-1">กด "ส่งคำขอพาร์ทเนอร์" เพื่อเริ่มต้น</p>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {accepted.map((rel) => (
              <RelationshipCard
                key={rel.id}
                rel={rel}
                myTenantId={user?.tenantId ?? ''}
                onAccept={openAccept}
                onReject={openReject}
                onCancel={openCancel}
                onSuspend={openSuspend}
                onResume={openResume}
                canManage={isOwner}
                isLoading={anyLoading}
              />
            ))}
          </div>
        )}
      </SectionCard>

      {/* Pending outgoing requests */}
      {pending.filter((r) => r.initiatorTenantId === user?.tenantId).length > 0 && (
        <SectionCard
          title="คำขอที่รอการตอบรับ"
          description="คำขอที่คุณส่งออกไปและรอการตอบรับ"
        >
          <div className="space-y-2">
            {pending
              .filter((r) => r.initiatorTenantId === user?.tenantId)
              .map((rel) => (
                <RelationshipCard
                  key={rel.id}
                  rel={rel}
                  myTenantId={user?.tenantId ?? ''}
                  onAccept={openAccept}
                  onReject={openReject}
                  onCancel={openCancel}
                  isLoading={anyLoading}
                />
              ))}
          </div>
        </SectionCard>
      )}

      {/* Past (rejected/cancelled) */}
      {past.length > 0 && (
        <SectionCard title="ประวัติ" description="คำขอที่ปฏิเสธหรือยกเลิกแล้ว">
          <div className="space-y-2">
            {past.map((rel) => (
              <RelationshipCard
                key={rel.id}
                rel={rel}
                myTenantId={user?.tenantId ?? ''}
                onAccept={openAccept}
                onReject={openReject}
                onCancel={openCancel}
                isLoading={anyLoading}
              />
            ))}
          </div>
        </SectionCard>
      )}

      {/* Send partner request dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ส่งคำขอพาร์ทเนอร์</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="partner-email">อีเมลของร้านพาร์ทเนอร์</Label>
              <Input
                id="partner-email"
                type="email"
                placeholder="partner@example.com"
                value={partnerEmail}
                onChange={(e) => setPartnerEmail(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                กรอกอีเมลที่ร้านพาร์ทเนอร์ใช้ลงทะเบียนใน FixITPro
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="partner-note">หมายเหตุ (ไม่บังคับ)</Label>
              <Textarea
                id="partner-note"
                placeholder="แนะนำตัวหรืออธิบายความร่วมมือที่ต้องการ..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setShowSendDialog(false); setPartnerEmail(''); setNote('') }}
            >
              ยกเลิก
            </Button>
            <Button
              disabled={!partnerEmail.trim() || sendMutation.isPending}
              onClick={() => sendMutation.mutate({ partnerEmail: partnerEmail.trim(), note: note.trim() || undefined })}
            >
              {sendMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              ส่งคำขอ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm action dialog */}
      {confirmAction && (
        <ConfirmDialog
          open={!!confirmAction}
          title={
            confirmAction.type === 'accept' ? 'ยืนยันการยอมรับพาร์ทเนอร์' :
            confirmAction.type === 'reject' ? 'ยืนยันการปฏิเสธ' :
            confirmAction.type === 'suspend' ? 'ระงับการส่งงานกับร้านนี้' :
            confirmAction.type === 'resume' ? 'เปิดส่งงานอีกครั้ง' :
            'ยืนยันการยกเลิกคำขอ'
          }
          body={
            confirmAction.type === 'accept'
              ? `ยืนยันการยอมรับ ${confirmAction.shop ?? 'ร้านนี้'} เป็นพาร์ทเนอร์? หลังจากนี้ร้านดังกล่าวจะสามารถรับงานซ่อมต่อจากคุณได้`
              : confirmAction.type === 'reject'
              ? `ยืนยันการปฏิเสธคำขอจาก ${confirmAction.shop ?? 'ร้านนี้'}?`
              : confirmAction.type === 'suspend'
              ? `ระงับการส่งงานกับ ${confirmAction.shop ?? 'ร้านนี้'}? ส่งงานใหม่และเดินงานที่ค้างต่อไม่ได้ แต่ส่งเครื่องที่ค้างคืนกันได้ตามปกติ — เปิดใช้อีกครั้งได้เฉพาะร้านของคุณ`
              : confirmAction.type === 'resume'
              ? `เปิดส่งงานกับ ${confirmAction.shop ?? 'ร้านนี้'} อีกครั้ง?`
              : `ยืนยันการยกเลิกคำขอที่ส่งไปให้ ${confirmAction.shop ?? 'ร้านนี้'}?`
          }
          confirmLabel={
            confirmAction.type === 'accept' ? 'ยืนยันยอมรับ' :
            confirmAction.type === 'reject' ? 'ปฏิเสธ' :
            confirmAction.type === 'suspend' ? 'ระงับ' :
            confirmAction.type === 'resume' ? 'เปิดใช้อีกครั้ง' : 'ยกเลิกคำขอ'
          }
          confirmVariant={confirmAction.type === 'accept' || confirmAction.type === 'resume' ? 'default' : 'destructive'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
