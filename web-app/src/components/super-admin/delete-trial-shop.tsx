'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'

type DeleteCheck = {
  shopName: string
  sales: number
  repairs: number
  products: number
  customers: number
  users: number
  canDelete: boolean
  reasons: string[]
}

/**
 * Remove a trial shop nobody really used (no sales, no repair jobs): hidden from the lists, its
 * people cannot log in, its email is free to sign up again. Records stay and can be restored.
 */
export function DeleteTrialShopDialog({ tenantId, onClose }: { tenantId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [typed, setTyped] = useState('')
  const { data: check, isLoading } = useQuery<DeleteCheck>({
    queryKey: ['sa-tenant-delete-check', tenantId],
    queryFn:  async () => (await api.get(`/super-admin/tenants/${tenantId}/delete-check`)).data,
  })
  const remove = useMutation({
    mutationFn: () => api.post(`/super-admin/tenants/${tenantId}/delete`, { confirmName: typed }),
    onSuccess: () => {
      toast.success(`ลบร้าน ${check?.shopName ?? ''} แล้ว — กู้คืนได้จากแท็บ "ลบแล้ว"`)
      qc.invalidateQueries({ queryKey: ['sa-tenants'] })
      qc.invalidateQueries({ queryKey: ['sa-stats'] })
      onClose()
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'ลบร้านไม่สำเร็จ')),
  })
  const nameOk = !!check && typed.trim() === check.shopName.trim()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-bold text-white"><Trash2 className="h-5 w-5 text-red-400" /> ลบร้านทดลอง</h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        {isLoading || !check ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <div className="rounded-xl bg-slate-800 p-3 text-sm text-slate-300 space-y-1">
              <p className="font-semibold text-white">{check.shopName}</p>
              <p>บิลขาย {check.sales} · งานซ่อม {check.repairs} · สินค้า {check.products} · ลูกค้า {check.customers} · ผู้ใช้ {check.users}</p>
            </div>
            {!check.canDelete ? (
              <p className="rounded-xl bg-orange-950 px-3 py-2 text-sm text-orange-200">
                ลบไม่ได้: {check.reasons.join(', ')} — ร้านนี้มีการใช้งานจริง ใช้ &quot;ระงับร้าน&quot; แทน
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-300">
                  ร้านจะหายจากรายชื่อ ผู้ใช้ของร้านเข้าระบบไม่ได้ และอีเมลจะว่างให้สมัครใหม่ได้ ข้อมูลยังเก็บไว้ กู้คืนได้จากแท็บ &quot;ลบแล้ว&quot;
                </p>
                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400">พิมพ์ชื่อร้าน <span className="font-semibold text-white">{check.shopName}</span> เพื่อยืนยัน</label>
                  <input
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                  />
                </div>
              </>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300">ยกเลิก</button>
              {check.canDelete && (
                <button
                  type="button"
                  disabled={!nameOk || remove.isPending}
                  onClick={() => remove.mutate()}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {remove.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} ลบร้าน
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
