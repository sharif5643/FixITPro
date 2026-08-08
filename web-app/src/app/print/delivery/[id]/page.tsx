'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer, X } from 'lucide-react'
import { RepairDeliveryReceipt } from '@/components/receipt/repair-delivery-receipt'
import api from '@/lib/api'
import type { Repair, ShopSettings } from '@/types'

type PW = '58mm' | '80mm'

export default function DeliveryPrintPage() {
  const { id }       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const initWidth    = (searchParams.get('paper') as PW) === '58mm' ? '58mm' : '80mm'
  const dual         = searchParams.get('copies') === '2'

  const [paperWidth, setPaperWidth] = useState<PW>(initWidth)
  const [printed, setPrinted]       = useState(false)

  const { data, isLoading, isError } = useQuery<Repair>({
    queryKey: ['repairs', id],
    queryFn:  async () => (await api.get(`/repairs/${id}`)).data,
    staleTime: 300_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  // Inject @page CSS whenever paper width changes
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-page-size'
    style.textContent = `
      @page { size: ${paperWidth} auto; margin: 3mm; }
      @media print { .no-print { display: none !important; } }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-page-size')?.remove()
  }, [paperWidth])

  // Auto-print once after data loads
  useEffect(() => {
    if (data && !printed) {
      setPrinted(true)
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [data, printed])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 flex items-center gap-3 bg-white border-b px-4 py-2 shadow-sm">
        <span className="text-sm font-semibold text-gray-700 shrink-0">
          ใบเสร็จรับเงิน{dual ? ' (2 ฉบับ)' : ''}
        </span>

        {/* Paper width toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs font-semibold">
          {(['80mm', '58mm'] as PW[]).map((w) => (
            <button
              key={w}
              onClick={() => setPaperWidth(w)}
              className={`px-3 py-1.5 transition-colors ${
                paperWidth === w
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="flex gap-2 ml-auto">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            พิมพ์
          </button>
          <button
            onClick={() => window.close()}
            className="inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            ปิด
          </button>
        </div>
      </div>

      <div className="flex justify-center p-6">
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : isError ? (
          <p className="text-red-600 py-20">ไม่สามารถโหลดข้อมูลได้</p>
        ) : data ? (
          <div className="bg-white shadow-md p-4">
            {dual ? (
              <>
                <div className="relative">
                  <span className="no-print absolute top-0 right-0 text-[8px] text-slate-400 font-medium">ฉบับร้าน</span>
                  <RepairDeliveryReceipt repair={data} paperWidth={paperWidth} settings={settings} copyType="shop" />
                </div>
                <div className="flex items-center gap-1 my-3 px-1">
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                  <span className="text-[9px] text-slate-400 shrink-0 select-none">✂&nbsp;ฉีกตรงนี้</span>
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                </div>
                <div className="relative">
                  <span className="no-print absolute top-0 right-0 text-[8px] text-slate-400 font-medium">ฉบับลูกค้า</span>
                  <RepairDeliveryReceipt repair={data} paperWidth={paperWidth} settings={settings} copyType="customer" />
                </div>
              </>
            ) : (
              <RepairDeliveryReceipt repair={data} paperWidth={paperWidth} settings={settings} />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
