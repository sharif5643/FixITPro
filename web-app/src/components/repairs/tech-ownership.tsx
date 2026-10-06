'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Eye, Hand, Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

/**
 * Technicians work only on their own jobs (enforced by the API, repairs.service assertCanWorkOn).
 * Any technician can open every job to answer a customer, take a job nobody has yet, and take
 * payment / hand a device back for a colleague — but not change a colleague's job.
 */

interface OwnedRepair {
  id: string
  status: string
  technicianId?: string | null
  technician?: { id: string; name?: string | null } | null
}

const CLOSED = ['DELIVERED', 'CANCELLED']

export function useTechOwnership(repair: OwnedRepair | null | undefined) {
  const user = useAuthStore((s) => s.user)
  const isTech = user?.role === 'TECHNICIAN'
  const techId = repair?.technician?.id ?? repair?.technicianId ?? null
  const mine = !!techId && techId === user?.id
  const unassigned = !techId
  return {
    isTech,
    mine,
    unassigned,
    /** a technician looking at a job that is not theirs: view only (payment and handover still allowed) */
    viewOnly: isTech && !mine,
    ownerName: repair?.technician?.name ?? null,
    userId: user?.id ?? null,
  }
}

/** The bar on a job page: "take this job" for an open job, or "view only" for a colleague's. */
export function TechOwnershipBar({ repair, onChanged, className = '' }: {
  repair: OwnedRepair | null | undefined
  onChanged: () => void
  className?: string
}) {
  const own = useTechOwnership(repair)
  const claim = useMutation({
    mutationFn: () => api.patch(`/repairs/${repair!.id}`, { technicianId: own.userId }),
    onSuccess: () => { toast.success('รับงานแล้ว — งานนี้อยู่ใน "งานของฉัน"'); onChanged() },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })
  if (!repair || !own.isTech || own.mine || CLOSED.includes(repair.status)) return null

  if (own.unassigned) {
    return (
      <div className={`flex items-center gap-3 rounded-2xl border-2 border-dashed border-violet-300 bg-violet-50 p-3 ${className}`}>
        <Hand className="h-5 w-5 shrink-0 text-violet-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-violet-900">งานนี้ยังไม่มีช่างรับ</p>
          <p className="text-xs text-violet-700">กดรับงานก่อน จึงจะเปลี่ยนสถานะ เพิ่มอะไหล่ หรือแก้ไขได้</p>
        </div>
        <button onClick={() => claim.mutate()} disabled={claim.isPending}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white disabled:opacity-60">
          {claim.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Hand className="h-4 w-4" />} รับงานนี้
        </button>
      </div>
    )
  }

  return (
    <div className={`flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-100 p-3 ${className}`}>
      <Eye className="h-5 w-5 shrink-0 text-slate-500" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-800">งานของช่าง {own.ownerName ?? 'คนอื่น'} — ดูได้อย่างเดียว</p>
        <p className="text-xs text-slate-500">แก้ไขงานไม่ได้ · รับเงินและส่งมอบเครื่องให้ลูกค้าแทนได้</p>
      </div>
    </div>
  )
}
