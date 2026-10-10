'use client'

import { CheckCircle2, ChevronRight, DollarSign, Loader2 } from 'lucide-react'
import { NEXT_ACTION, PATH_TO_DONE } from '@/lib/repair-status-flow'

/**
 * The job's next step as one big button, "ซ่อมเสร็จเลย" for quick jobs, and taking payment once
 * it is done — so nobody has to scroll to a status list to move a job along.
 */
export function RepairNextStep({
  status, paymentPending, canPay, busy, onSteps, onPay,
}: {
  status: string
  paymentPending: boolean
  /** an open shift is needed to take money */
  canPay: boolean
  busy: boolean
  /** take these statuses one after another */
  onSteps: (steps: string[], doneLabel: string) => void
  onPay?: () => void
}) {
  const next = NEXT_ACTION[status]
  const path = PATH_TO_DONE[status]
  const payable = (status === 'COMPLETED' || status === 'READY_PICKUP') && paymentPending && !!onPay
  if (!next && !payable) return null
  return (
    <div className="flex flex-wrap gap-2">
      {payable && (
        <button
          type="button"
          onClick={onPay}
          disabled={!canPay}
          className="flex h-12 min-w-[10rem] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-green-600 text-sm font-bold text-white active:bg-green-700 disabled:opacity-50"
        >
          <DollarSign className="h-4 w-4" />
          {canPay ? 'ส่งมอบ / รับเงิน' : 'เปิดกะก่อนรับเงิน'}
        </button>
      )}
      {next && (
        <button
          type="button"
          onClick={() => onSteps([next.to], next.label)}
          disabled={busy}
          className="flex h-12 min-w-[10rem] flex-1 items-center justify-center gap-1.5 rounded-2xl bg-blue-600 text-sm font-bold text-white active:bg-blue-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          {next.label}
        </button>
      )}
      {path && path.length > 1 && (
        <button
          type="button"
          onClick={() => onSteps(path, 'ซ่อมเสร็จ')}
          disabled={busy}
          className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border-2 border-green-300 bg-white px-4 text-sm font-bold text-green-700 active:bg-green-50 disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          ซ่อมเสร็จเลย
        </button>
      )}
    </div>
  )
}
