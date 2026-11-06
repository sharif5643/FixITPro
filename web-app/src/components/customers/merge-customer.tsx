'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, Loader2, Users, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { CustomerPickSheet, type PickedCustomer } from './customer-pick-sheet'

interface Preview {
  keep: { id: string; name: string; phone?: string | null; points: number }
  from: { id: string; name: string; phone?: string | null; points: number; createdAt: string }
  moves: Record<'repairs' | 'sales' | 'saleRefunds' | 'claims' | 'packageSales' | 'warranties' | 'notes' | 'loyalty' | 'documents', number>
}

const MOVE_LABEL: [keyof Preview['moves'], string][] = [
  ['repairs', '🔧 งานซ่อม'], ['sales', '🧾 บิลขาย'], ['claims', '🛡️ เคลม'], ['warranties', '📄 ประกัน'],
  ['packageSales', '📶 ซิม / เติมเงิน'], ['saleRefunds', '↩️ คืนเงิน'], ['notes', '📝 โน้ต'], ['documents', '🗂️ เอกสาร A4'],
]

/**
 * "รวมลูกค้าซ้ำ": the same person was added twice. Pick the duplicate; everything of it (repairs,
 * bills, claims, warranties, points…) moves to this customer, then the empty duplicate goes.
 */
export function MergeCustomerButton({ customer, className }: { customer: { id: string; name: string }; className?: string }) {
  const [step, setStep] = useState<'closed' | 'pick' | 'confirm'>('closed')
  const [from, setFrom] = useState<PickedCustomer | null>(null)
  const qc = useQueryClient()

  const { data: preview, isLoading } = useQuery<Preview>({
    queryKey: ['customer-merge-preview', customer.id, from?.id],
    queryFn: async () => (await api.get(`/customers/${customer.id}/merge-preview`, { params: { fromId: from!.id } })).data,
    enabled: step === 'confirm' && !!from,
  })
  const merge = useMutation({
    mutationFn: async () => (await api.post(`/customers/${customer.id}/merge`, { fromId: from!.id })).data,
    onSuccess: () => {
      toast.success(`รวม ${from?.name} เข้ากับ ${customer.name} แล้ว`)
      setStep('closed'); setFrom(null)
      qc.invalidateQueries({ queryKey: ['customer'] })
      qc.invalidateQueries({ queryKey: ['customers'] })
      qc.invalidateQueries({ queryKey: ['customer-loyalty'] })
      qc.invalidateQueries({ queryKey: ['repairs'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  const total = preview ? Object.values(preview.moves).reduce((a, b) => a + b, 0) : 0
  return (
    <>
      <button type="button" onClick={() => setStep('pick')} className={className}>
        <Users className="h-4 w-4" /> รวมลูกค้าซ้ำ
      </button>
      {step === 'pick' && (
        <CustomerPickSheet
          title={`รายการซ้ำของ “${customer.name}”`}
          hint="เลือกรายชื่อที่เพิ่มซ้ำ — ทุกอย่างของรายการนั้นจะย้ายมาอยู่ที่ลูกค้าคนนี้"
          excludeId={customer.id}
          onPick={(c) => { setFrom(c); setStep('confirm') }}
          onClose={() => setStep('closed')}
        />
      )}
      {step === 'confirm' && from && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setStep('closed')} />
          <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 sm:rounded-3xl dark:bg-slate-900">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <p className="flex-1 text-lg font-bold">รวมลูกค้าซ้ำ</p>
              <button type="button" onClick={() => setStep('closed')} aria-label="ปิด" className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {isLoading || !preview ? <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />กำลังตรวจ…</p> : (
              <>
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-900/20">
                  <p className="text-xs text-red-700 dark:text-red-300">รายการซ้ำ (จะถูกรวมแล้วเอาออก)</p>
                  <p className="font-bold">{preview.from.name} <span className="font-normal text-muted-foreground">{preview.from.phone ?? 'ไม่มีเบอร์'}</span></p>
                </div>
                <div className="my-2 flex justify-center text-slate-400"><ArrowDown className="h-5 w-5" /></div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-900/20">
                  <p className="text-xs text-emerald-700 dark:text-emerald-300">เก็บไว้ (ลูกค้าตัวจริง)</p>
                  <p className="font-bold">{preview.keep.name} <span className="font-normal text-muted-foreground">{preview.keep.phone ?? 'ไม่มีเบอร์'}</span></p>
                </div>
                <p className="mt-4 text-sm font-semibold">จะย้ายมา{total === 0 && preview.from.points === 0 ? ' — ไม่มีรายการ' : ''}</p>
                <div className="mt-1 grid grid-cols-2 gap-1.5 text-sm">
                  {MOVE_LABEL.filter(([k]) => preview.moves[k] > 0).map(([k, label]) => (
                    <div key={k} className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800"><span>{label}</span><b className="tabular-nums">{preview.moves[k]}</b></div>
                  ))}
                  {preview.from.points > 0 && (
                    <div className="flex justify-between rounded-lg bg-slate-50 px-3 py-1.5 dark:bg-slate-800"><span>⭐ แต้มสะสม</span><b className="tabular-nums">+{preview.from.points}</b></div>
                  )}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                  ข้อมูลที่ลูกค้าตัวจริงยังไม่มี (เบอร์ อีเมล ที่อยู่) จะเอามาจากรายการซ้ำ · มีบันทึกในโน้ตลูกค้าและประวัติระบบว่ารวมจากใคร · ทำย้อนกลับไม่ได้
                </p>
                <button type="button" disabled={merge.isPending} onClick={() => merge.mutate()}
                  className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 font-bold text-white hover:bg-blue-700 disabled:opacity-50">
                  {merge.isPending && <Loader2 className="h-4 w-4 animate-spin" />} รวมเข้ากับ {preview.keep.name}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
