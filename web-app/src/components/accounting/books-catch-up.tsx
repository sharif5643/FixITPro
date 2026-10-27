'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'
import { useAuthStore } from '@/store/auth.store'

interface CatchUp { enabled: boolean; repairs: number; sales: number; expenses: number; packageSales: number }

/**
 * Payments taken while the shop's books could not be written (no chart of accounts yet) are
 * missing from them. Shown to owners only when something is missing; one tap posts it all.
 */
export function BooksCatchUp() {
  const qc = useQueryClient()
  const canRun = useAuthStore((s) => s.hasPermission('accounting.admin'))
  const { data } = useQuery<CatchUp>({
    queryKey: ['books-catch-up'],
    queryFn: () => api.get('/admin/accounting/catch-up').then((r) => r.data),
    enabled: canRun,
    staleTime: 60_000,
  })
  const run = useMutation({
    mutationFn: () => api.post('/admin/accounting/catch-up').then((r) => r.data as CatchUp),
    onSuccess: () => {
      toast.success('บันทึกรายการที่ตกหล่นลงบัญชีแล้ว')
      qc.invalidateQueries()
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })

  if (!canRun || !data?.enabled) return null
  const parts = [
    data.repairs && `งานซ่อม ${data.repairs} งาน`,
    data.sales && `บิลขาย ${data.sales} บิล`,
    data.expenses && `ค่าใช้จ่าย ${data.expenses} รายการ`,
    data.packageSales && `ขายซิม/เน็ต ${data.packageSales} รายการ`,
  ].filter(Boolean)
  if (!parts.length) return null

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex gap-2.5 flex-1 min-w-0">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="text-sm text-amber-800">
          <p className="font-semibold">มีรายการที่ยังไม่อยู่ในสมุดบัญชี</p>
          <p className="text-amber-700">{parts.join(' · ')} — รับเงินแล้วแต่ระบบบัญชีบันทึกไม่ได้ในตอนนั้น กดเพื่อบันทึกเพิ่ม (ลงวันที่วันนี้)</p>
        </div>
      </div>
      <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending} className="shrink-0 bg-amber-600 hover:bg-amber-700">
        {run.isPending && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
        บันทึกลงบัญชี
      </Button>
    </div>
  )
}
