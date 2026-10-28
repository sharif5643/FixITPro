'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { CheckCircle2, Loader2, PenLine, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { SignaturePad } from './signature-pad'
import type { RepairSignature, RepairSignatureKind } from '@/types'

const KINDS: { kind: RepairSignatureKind; label: string; hint: string }[] = [
  { kind: 'INTAKE',   label: 'ลูกค้าเซ็นรับทราบตอนฝากเครื่อง', hint: 'สภาพเครื่อง อุปกรณ์ที่ฝาก และเงื่อนไขการซ่อม' },
  { kind: 'APPROVAL', label: 'ลูกค้าเซ็นอนุมัติราคา',          hint: 'ตกลงราคาซ่อมตามที่ร้านแจ้ง' },
]

export const SIGNATURE_LABEL: Record<RepairSignatureKind, string> = {
  INTAKE:   'ลายเซ็นลูกค้า (ฝากเครื่อง)',
  APPROVAL: 'ลายเซ็นลูกค้า (อนุมัติราคา)',
}

function fmt(iso: string) {
  try { return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) } catch { return '' }
}

/** Sign on the screen: full-screen sheet, works the same in the web, the staff app and SUNMI */
export function SignatureSheet({
  repairId, kind, customerName, onClose, onSaved,
}: {
  repairId: string; kind: RepairSignatureKind; customerName?: string | null
  onClose: () => void; onSaved: () => void
}) {
  const [png, setPng] = useState<string | null>(null)
  const [name, setName] = useState(customerName ?? '')
  const meta = KINDS.find((k) => k.kind === kind)!
  const save = useMutation({
    mutationFn: () => api.post(`/repairs/${repairId}/signatures`, { kind, image: png, signerName: name.trim() || undefined }),
    onSuccess: () => { toast.success('บันทึกลายเซ็นแล้ว'); onSaved(); onClose() },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  return (
    <div role="dialog" aria-modal="true" aria-label={meta.label} className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 sm:items-center">
      <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
        style={{ paddingBottom: 'calc(20px + env(safe-area-inset-bottom))' }}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-base font-bold text-slate-900">{meta.label}</p>
            <p className="text-xs text-slate-500">{meta.hint}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SignaturePad onChange={setPng} />
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ชื่อผู้เซ็น (ไม่บังคับ)" maxLength={100}
          className="mt-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-slate-400" />
        <button type="button" onClick={() => save.mutate()} disabled={!png || save.isPending}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-slate-900 text-sm font-bold text-white disabled:opacity-40">
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          บันทึกลายเซ็น
        </button>
      </div>
    </div>
  )
}

/** The job's signatures: what is signed, and a button to sign (or sign again) */
export function RepairSignatures({
  repairId, signatures, customerName, onSaved, disabled,
}: {
  repairId: string; signatures?: RepairSignature[] | null; customerName?: string | null
  onSaved: () => void; disabled?: boolean
}) {
  const [open, setOpen] = useState<RepairSignatureKind | null>(null)
  return (
    <div className="space-y-2">
      {KINDS.map(({ kind, label }) => {
        const sig = signatures?.find((s) => s.kind === kind)
        return (
          <div key={kind} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2.5">
            {sig
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={sig.image} alt={label} className="h-10 w-20 shrink-0 rounded border border-slate-100 object-contain" />
              : <PenLine className="h-5 w-5 shrink-0 text-slate-400" />}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{label}</p>
              <p className="truncate text-xs text-slate-500">
                {sig ? `เซ็นแล้ว ${fmt(sig.createdAt)}${sig.signerName ? ` · ${sig.signerName}` : ''}` : 'ยังไม่ได้เซ็น'}
              </p>
            </div>
            <button type="button" onClick={() => setOpen(kind)} disabled={disabled}
              className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">
              {sig ? 'เซ็นใหม่' : 'ให้ลูกค้าเซ็น'}
            </button>
          </div>
        )
      })}
      {open && (
        <SignatureSheet repairId={repairId} kind={open} customerName={customerName}
          onClose={() => setOpen(null)} onSaved={onSaved} />
      )}
    </div>
  )
}
