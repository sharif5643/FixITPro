'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import api from '@/lib/api'
import { apiErrorMessage } from '@/lib/utils'

/**
 * The supplier's tax invoice for a PO with VAT: its number and date. The shop's purchase tax
 * report counts the input VAT only when both are there (and the supplier has a tax id).
 */
export function SupplierTaxInvoiceForm({ po }: { po: { id: string; supplierTaxInvoiceNo?: string | null; supplierTaxInvoiceDate?: string | null } }) {
  const qc = useQueryClient()
  const [no, setNo]     = useState(po.supplierTaxInvoiceNo ?? '')
  const [date, setDate] = useState(po.supplierTaxInvoiceDate ? po.supplierTaxInvoiceDate.slice(0, 10) : '')
  const save = useMutation({
    mutationFn: () => api.patch(`/purchase-orders/${po.id}/supplier-tax-invoice`, {
      supplierTaxInvoiceNo: no, supplierTaxInvoiceDate: date ? new Date(`${date}T12:00:00+07:00`).toISOString() : '',
    }),
    onSuccess: () => {
      toast.success('บันทึกใบกำกับภาษีของผู้ขายแล้ว')
      qc.invalidateQueries({ queryKey: ['purchase-orders'] })
      qc.invalidateQueries({ queryKey: ['tax-reports'] })
    },
    onError: (e) => toast.error(apiErrorMessage(e)),
  })
  const done = !!po.supplierTaxInvoiceNo
  return (
    <div className={`rounded-lg border p-3 space-y-2 ${done ? 'border-slate-200 dark:border-slate-700/60' : 'border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-900/10'}`}>
      <p className="text-sm font-semibold">ใบกำกับภาษีของผู้ขาย</p>
      {!done && <p className="text-xs text-amber-800 dark:text-amber-300">ใส่เลขที่และวันที่ตามใบกำกับภาษีที่ได้รับ เพื่อนับเป็นภาษีซื้อในรายงานภาษี</p>}
      <div className="flex flex-wrap gap-2">
        <Input className="h-9 w-48" placeholder="เลขที่ใบกำกับภาษี" value={no} maxLength={60} onChange={(e) => setNo(e.target.value)} aria-label="เลขที่ใบกำกับภาษีของผู้ขาย" />
        <Input className="h-9 w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="วันที่ใบกำกับภาษีของผู้ขาย" />
        <Button size="sm" className="h-9" disabled={save.isPending || !no.trim() || !date} onClick={() => save.mutate()}>
          {save.isPending ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </div>
    </div>
  )
}
