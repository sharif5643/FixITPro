'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer, X } from 'lucide-react'
import { RepairReceipt } from '@/components/receipt/repair-receipt'
import api from '@/lib/api'
import type { Repair, ShopSettings } from '@/types'

type PW = '58mm' | '80mm' | 'A4'

export default function RepairPrintPage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const paperWidth = (searchParams.get('paper') as PW) || '80mm'
  const dual       = searchParams.get('copies') === '2'
  const isApkMode  = searchParams.get('mode') === 'apk'
  const copyType   = searchParams.get('copy') as 'customer' | 'shop' | null  // null = default (customer)
  const isShopCopy = copyType === 'shop'
  const [printed, setPrinted] = useState(false)
  const [origin, setOrigin]   = useState('')

  useEffect(() => { setOrigin(window.location.origin) }, [])

  const { data, isLoading, isError } = useQuery<Repair>({
    queryKey: ['repairs', id],
    queryFn: async () => (await api.get(`/repairs/${id}`)).data,
    staleTime: 300_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  // Inject @page CSS for paper size
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-page-size'
    style.textContent = `
      @page { size: ${paperWidth === 'A4' ? 'A4 portrait' : `${paperWidth} auto`}; margin: ${paperWidth === 'A4' ? '10mm' : '0mm'}; }
      @media print {
        html, body { min-height: 0 !important; height: auto !important; background: #fff !important; margin: 0 !important; padding: 0 !important; }
        .no-print { display: none !important; }
        .print-outer  { display: block !important; padding: 0 !important; margin: 0 !important; min-height: 0 !important; background: transparent !important; }
        .print-mid    { display: block !important; padding: 0 !important; margin: 0 !important; }
        .print-wrapper { display: block !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; background: transparent !important; }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-page-size')?.remove()
  }, [paperWidth])

  // Signal APK iframe that receipt data AND settings are ready (H-3: wait for both)
  useEffect(() => {
    if (data && settings !== undefined && isApkMode) {
      document.documentElement.setAttribute('data-receipt-ready', '1')
    }
  }, [data, settings, isApkMode])

  // Auto-print after data loads (browser only — suppressed in APK iframe mode)
  useEffect(() => {
    if (data && !printed && !isApkMode) {
      setPrinted(true)
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [data, printed, isApkMode])

  return (
    <div className="min-h-screen bg-gray-100 print-outer">
      {/* Print controls — hidden when printing or in APK iframe mode */}
      <div className={`no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b px-4 py-2 shadow-sm${isApkMode ? ' hidden' : ''}`}>
        <span className="text-sm font-semibold text-gray-700">
          ใบรับงานซ่อม — {paperWidth === 'A4' ? 'A4' : paperWidth}{dual ? ' (2 ฉบับ)' : ''}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
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

      {/* Receipt */}
      <div className="flex justify-center p-6 print-mid">
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : isError ? (
          <p className="text-red-600 py-20">ไม่สามารถโหลดข้อมูลได้</p>
        ) : data ? (
          <div className="bg-white shadow-md p-4 print-wrapper">
            {dual ? (
              <>
                {/* ใบร้าน */}
                <div className="relative">
                  <span className="no-print absolute top-0 right-0 text-[8px] text-slate-400 font-medium">ใบร้าน</span>
                  <RepairReceipt repair={data} paperWidth={paperWidth} settings={settings} />
                </div>

                {/* เส้นฉีก */}
                <div className="flex items-center gap-1 my-3 px-1">
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                  <span className="text-[9px] text-slate-400 shrink-0 select-none">✂&nbsp;ฉีกตรงนี้</span>
                  <div className="flex-1 border-t-2 border-dashed border-slate-300" />
                </div>

                {/* ใบลูกค้า */}
                <div className="relative">
                  <span className="no-print absolute top-0 right-0 text-[8px] text-slate-400 font-medium">ใบลูกค้า</span>
                  <RepairReceipt repair={data} paperWidth={paperWidth} settings={settings} trackingBaseUrl={origin} />
                </div>
              </>
            ) : (
              <RepairReceipt
                repair={data}
                paperWidth={paperWidth}
                settings={settings}
                trackingBaseUrl={isShopCopy ? undefined : origin}
              />
            )}
          </div>
        ) : null}
      </div>
    </div>
  )
}
