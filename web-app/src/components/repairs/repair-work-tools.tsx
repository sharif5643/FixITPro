'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'
import { canMoveRepair } from '@/lib/repair-status-flow'

/**
 * The repair steps the web does in its detail dialog and job board, for the SUNMI and staff
 * screens: who works on the job, the quote sent to the customer, the customer's approval and the
 * IMEI. Same API calls and the same rules as the web, so a job moves the same way on every device.
 */

interface WorkRepair {
  id: string
  status: string
  estimatedTotal?: number | string | null
  estimateCost?: number | string | null
  deviceImei?: string | null
  technician?: { id: string; name: string } | null
}

const OPEN_STATUSES = ['RECEIVED', 'DIAGNOSING', 'WAITING_APPROVAL', 'APPROVED', 'WAITING_PARTS', 'IN_PROGRESS', 'QC_PENDING']
const BOX = 'rounded-2xl border border-slate-200 bg-white p-3 space-y-2'
const INPUT = 'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500'
const BTN = 'h-11 shrink-0 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-50'

function useRepairPatch(repairId: string, onChanged: () => void) {
  return useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch(`/repairs/${repairId}`, data),
    onSuccess: onChanged,
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
}

/** Assign or change the technician — as the web's job board does. Owners and managers only. */
export function TechnicianPicker({ repair, onChanged }: { repair: WorkRepair; onChanged: () => void }) {
  const role    = useAuthStore((s) => s.user?.role)
  const canEdit = useAuthStore((s) => s.hasPermission)('repair.edit')
  const allowed = canEdit && (role === 'OWNER' || role === 'MANAGER' || role === 'SUPER_ADMIN')
  const { data: techs = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['technicians-simple'],
    queryFn:  () => api.get('/technicians/assignable').then((r) => r.data?.data ?? r.data ?? []),
    staleTime: 5 * 60_000,
    enabled:  allowed,
  })
  const patch = useRepairPatch(repair.id, () => { toast.success('บันทึกช่างแล้ว'); onChanged() })
  if (!allowed || !OPEN_STATUSES.includes(repair.status)) return null
  return (
    <div className={BOX}>
      <p className="text-xs font-semibold text-slate-500">ช่างที่รับผิดชอบ</p>
      <select
        value={repair.technician?.id ?? ''}
        disabled={patch.isPending}
        onChange={(e) => patch.mutate({ technicianId: e.target.value || null })}
        className={INPUT}
      >
        <option value="">— ยังไม่มีช่าง —</option>
        {techs.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  )
}

/** Quote → customer approval (with a note) → IMEI, as in the web's repair detail. */
export function RepairWorkTools({ repair, onChanged }: { repair: WorkRepair; onChanged: () => void }) {
  const canEdit = useAuthStore((s) => s.hasPermission)('repair.edit')
  const quoted  = Number(repair.estimatedTotal ?? repair.estimateCost ?? 0)
  const [price, setPrice]   = useState(quoted ? String(quoted) : '')
  const [note, setNote]     = useState('')
  const [imei, setImei]     = useState(repair.deviceImei ?? '')
  useEffect(() => { setPrice(quoted ? String(quoted) : '') }, [quoted])
  useEffect(() => { setImei(repair.deviceImei ?? '') }, [repair.deviceImei])

  const quote   = useRepairPatch(repair.id, () => { toast.success('บันทึกราคาประเมินแล้ว'); onChanged() })
  const approve = useRepairPatch(repair.id, () => { toast.success('บันทึกการอนุมัติแล้ว'); setNote(''); onChanged() })
  const saveImei = useRepairPatch(repair.id, () => { toast.success('บันทึก IMEI แล้ว'); onChanged() })

  if (!canEdit || !OPEN_STATUSES.includes(repair.status)) return null

  // Sending a quote also moves the job to "waiting for approval" where the API allows that move
  const toApproval = canMoveRepair(repair.status, 'WAITING_APPROVAL')
  function sendQuote() {
    const n = Number(price)
    if (!n || n <= 0) { toast.error('กรุณาระบุราคาค่าซ่อม'); return }
    quote.mutate({ estimatedTotal: n, ...(toApproval ? { status: 'WAITING_APPROVAL' } : {}) })
  }

  return (
    <div className="space-y-3">
      <TechnicianPicker repair={repair} onChanged={onChanged} />

      {repair.status !== 'QC_PENDING' && (
        <div className={BOX}>
          <p className="text-xs font-semibold text-slate-500">
            ราคาประเมินให้ลูกค้า {toApproval && <span className="font-normal text-slate-400">— ส่งแล้วงานจะเป็น "รออนุมัติ"</span>}
          </p>
          <div className="flex gap-2">
            <input type="number" inputMode="numeric" min={0} value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="ราคาค่าซ่อม (บาท)" className={INPUT} />
            <button onClick={sendQuote} disabled={quote.isPending} className={`${BTN} bg-amber-500`}>
              {quote.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : toApproval ? 'ส่งราคา' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}

      {repair.status === 'WAITING_APPROVAL' && (
        <div className={BOX}>
          <p className="text-xs font-semibold text-slate-500">ลูกค้าอนุมัติราคาแล้ว?</p>
          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="หมายเหตุ (ไม่บังคับ) เช่น อนุมัติทางโทรศัพท์" className={INPUT} />
          <button onClick={() => approve.mutate({ status: 'APPROVED', approvalNote: note.trim() || undefined })}
            disabled={approve.isPending} className={`${BTN} w-full bg-emerald-600`}>
            {approve.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'ลูกค้าอนุมัติแล้ว'}
          </button>
        </div>
      )}

      <div className={BOX}>
        <p className="text-xs font-semibold text-slate-500">IMEI / Serial</p>
        <div className="flex gap-2">
          <input value={imei} onChange={(e) => setImei(e.target.value)} maxLength={20}
            placeholder="IMEI หรือ Serial" className={`${INPUT} font-mono`} />
          <button onClick={() => saveImei.mutate({ deviceImei: imei.trim() || null })}
            disabled={saveImei.isPending || imei.trim() === (repair.deviceImei ?? '')}
            className={`${BTN} bg-slate-800`}>
            {saveImei.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  )
}
