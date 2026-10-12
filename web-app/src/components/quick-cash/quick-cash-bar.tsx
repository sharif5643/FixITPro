'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAppBranch } from '@/hooks/useAppBranch'
import type { ShopSettings } from '@/types'
import type { CashDirection } from '@/lib/quick-cash'
import { QuickCashDialog } from './quick-cash-dialog'
import { QuickRepairDialog } from './quick-repair-dialog'
import { PartsPendingDialog, usePartsPending } from './parts-pending-dialog'

/**
 * Optional module "รับ-จ่ายเงินด่วน" on the sale screens (web, staff app, SUNMI): money in / out of
 * the drawer with what it was for, a repair paid with no intake ticket, and the jobs whose parts
 * are still to be taken from stock. Shows nothing unless the owner turned it on in settings.
 */
export function QuickCashBar({ className, disabled }: { className?: string; disabled?: boolean }) {
  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })
  const enabled = settings?.quickCashEnabled === true
  const { branchId } = useAppBranch()
  const { data: pending = [] } = usePartsPending(branchId, enabled)
  const [cash, setCash] = useState<CashDirection | null>(null)
  const [repairOpen, setRepairOpen] = useState(false)
  const [pendingOpen, setPendingOpen] = useState(false)

  if (!enabled) return null

  const btn = 'flex-1 min-w-0 rounded-xl px-2 py-2 text-xs sm:text-sm font-bold transition-colors active:scale-[0.98] disabled:opacity-50 whitespace-nowrap'
  return (
    <>
      <div className={cn('flex gap-1.5', className)}>
        <button type="button" disabled={disabled} onClick={() => setCash('IN')} className={cn(btn, 'bg-emerald-600 text-white hover:bg-emerald-700')}>
          💰 <span className="sm:hidden">รับเงิน</span><span className="hidden sm:inline">รับเงินเข้า</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => setCash('OUT')} className={cn(btn, 'bg-rose-600 text-white hover:bg-rose-700')}>
          💸 <span className="sm:hidden">เงินออก</span><span className="hidden sm:inline">เอาเงินออก</span>
        </button>
        <button type="button" disabled={disabled} onClick={() => setRepairOpen(true)} className={cn(btn, 'bg-blue-600 text-white hover:bg-blue-700')}>
          🔧 <span className="sm:hidden">ค่าซ่อม</span><span className="hidden sm:inline">รับเงินค่าซ่อม</span>
        </button>
        <button
          type="button"
          onClick={() => setPendingOpen(true)}
          className={cn(btn, 'relative flex-none border',
            pending.length > 0
              ? 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
              : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800')}
          title="งานที่ยังไม่เบิกอะไหล่"
          aria-label={`รอเบิกอะไหล่ ${pending.length} งาน`}
        >
          📦{pending.length > 0 ? ` ${pending.length}` : ''}<span className="hidden sm:inline"> รอเบิก</span>
        </button>
      </div>

      {cash && <QuickCashDialog direction={cash} open onOpenChange={(v) => { if (!v) setCash(null) }} />}
      <QuickRepairDialog open={repairOpen} onOpenChange={setRepairOpen} branchId={branchId} />
      <PartsPendingDialog open={pendingOpen} onOpenChange={setPendingOpen} branchId={branchId} />
    </>
  )
}

/** Before closing a shift: quick jobs still waiting for their parts (nothing when there are none). */
export function PartsPendingReminder({ className }: { className?: string }) {
  const { branchId } = useAppBranch()
  const { data: pending = [] } = usePartsPending(branchId)
  const [open, setOpen] = useState(false)
  if (pending.length === 0) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('w-full rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-900 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200', className)}
      >
        <span className="font-bold">📦 ยังมี {pending.length} งานที่ยังไม่เบิกอะไหล่</span>
        <span className="block text-xs opacity-80">แตะเพื่อเบิกของที่ใช้จริงก่อนปิดกะ (ปิดกะได้ แต่สต๊อกและกำไรต่องานจะยังไม่ครบ)</span>
      </button>
      <PartsPendingDialog open={open} onOpenChange={setOpen} branchId={branchId} />
    </>
  )
}
