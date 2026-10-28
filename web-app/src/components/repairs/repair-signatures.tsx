'use client'

import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PenLine } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { FullscreenSignature } from './signature-fullscreen'
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

/** Sign on the screen: the full-screen signing page, the same in the web, the staff app and SUNMI */
export function SignatureSheet({
  repairId, kind, customerName, onClose, onSaved,
}: {
  repairId: string; kind: RepairSignatureKind; customerName?: string | null
  onClose: () => void; onSaved: () => void
}) {
  const [name, setName] = useState(customerName ?? '')
  const meta = KINDS.find((k) => k.kind === kind)!
  const save = useMutation({
    mutationFn: (png: string) => api.post(`/repairs/${repairId}/signatures`, { kind, image: png, signerName: name.trim() || undefined }),
    onSuccess: () => { toast.success('บันทึกลายเซ็นแล้ว'); onSaved(); onClose() },
    onError: (err) => toast.error(apiErrorMessage(err)),
  })
  return (
    <FullscreenSignature title={meta.label} hint={meta.hint} name={name} onNameChange={setName}
      busy={save.isPending} onConfirm={(png) => save.mutate(png)} onCancel={onClose} />
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

/** Saves the signature drawn in the intake form once the job exists (a failure only warns: the job is saved) */
export async function saveIntakeSignature(repairId: string, png: string | null, signerName?: string | null) {
  if (!png) return
  try {
    await api.post(`/repairs/${repairId}/signatures`, { kind: 'INTAKE', image: png, signerName: signerName?.trim() || undefined })
  } catch (err) {
    toast.error(`บันทึกงานแล้ว แต่ลายเซ็นไม่ถูกบันทึก — ให้ลูกค้าเซ็นใหม่ในหน้างานซ่อม (${apiErrorMessage(err)})`)
  }
}

/**
 * "ให้ลูกค้าเซ็นชื่อ" inside the intake form: tick it and the full-screen signing page opens
 * (iPad / phone / SUNMI); the signature is saved with the job.
 */
export function IntakeSignatureField({ value, onChange, dark }: {
  value: string | null
  onChange: (png: string | null) => void
  dark?: boolean
}) {
  const [on, setOn] = useState(false)
  const [signing, setSigning] = useState(false)
  return (
    <div className={`space-y-2 rounded-xl border p-3 ${dark ? 'border-slate-700' : 'border-slate-200'}`}>
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
        <input type="checkbox" checked={on} className="h-4 w-4"
          onChange={(e) => {
            setOn(e.target.checked)
            if (e.target.checked) setSigning(true)
            else onChange(null)
          }} />
        <PenLine className="h-4 w-4" /> ให้ลูกค้าเซ็นชื่อรับทราบ
      </label>
      {on && (
        value ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={value} alt="ลายเซ็นลูกค้า" className="h-14 w-32 shrink-0 rounded border border-slate-200 bg-white object-contain" />
            <button type="button" onClick={() => setSigning(true)}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold">เซ็นใหม่</button>
          </div>
        ) : (
          <button type="button" onClick={() => setSigning(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-amber-300 py-3 text-sm font-semibold text-amber-700">
            <PenLine className="h-4 w-4" /> แตะเพื่อให้ลูกค้าเซ็น
          </button>
        )
      )}
      {signing && (
        <FullscreenSignature title="ลูกค้าเซ็นรับทราบตอนฝากเครื่อง" hint="สภาพเครื่อง อุปกรณ์ที่ฝาก และเงื่อนไขการซ่อม"
          onConfirm={(png) => { onChange(png); setSigning(false) }}
          onCancel={() => { setSigning(false); if (!value) setOn(false) }} />
      )}
    </div>
  )
}
