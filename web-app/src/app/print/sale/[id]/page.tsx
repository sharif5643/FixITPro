'use client'

import { useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2, Printer, X } from 'lucide-react'
import { SaleReceipt } from '@/components/receipt/sale-receipt'
import api from '@/lib/api'
import type { Sale, ShopSettings } from '@/types'

type PW = '58mm' | '80mm'

export default function SalePrintPage() {
  const { id }         = useParams<{ id: string }>()
  const searchParams   = useSearchParams()
  const paperWidth     = (searchParams.get('paper') as PW) || '80mm'
  const autoPrint      = searchParams.get('autoprint') === '1'
  const printFiredRef  = useRef(false)

  const { data, isLoading, isError } = useQuery<Sale>({
    queryKey: ['sales', id],
    queryFn: async () => (await api.get(`/sales/${id}`)).data,
    staleTime: 300_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  // Inject @page CSS + print layout overrides
  useEffect(() => {
    const style = document.createElement('style')
    style.id    = 'print-page-size'
    style.textContent = `
      @page {
        size: ${paperWidth} auto;
        margin: 2mm;
      }
      @media print {
        html, body {
          min-height: auto !important;
          height: auto !important;
          background: #fff !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .no-print { display: none !important; }
        .print-wrapper {
          display: block !important;
          padding: 0 !important;
          margin: 0 !important;
          box-shadow: none !important;
          background: transparent !important;
        }
        .print-outer {
          display: block !important;
          padding: 0 !important;
          background: transparent !important;
        }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-page-size')?.remove()
  }, [paperWidth])

  // Notify opener (receipt-dialog) when print dialog closes so it can pulse the cash drawer
  useEffect(() => {
    const handler = () => window.opener?.postMessage('receipt-afterprint', '*')
    window.addEventListener('afterprint', handler)
    return () => window.removeEventListener('afterprint', handler)
  }, [])

  // Auto-print when ?autoprint=1 — only once per page load
  useEffect(() => {
    if (!autoPrint || !data || printFiredRef.current) return
    printFiredRef.current = true
    const t = setTimeout(() => {
      window.print()
      // Close popup after print dialog is dismissed
      setTimeout(() => window.close(), 1000)
    }, 500)
    return () => clearTimeout(t)
  }, [autoPrint, data])

  return (
    <div className="min-h-screen bg-gray-100 print-outer">
      {/* Toolbar — hidden when printing */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b px-4 py-2 shadow-sm">
        <span className="text-sm font-semibold text-gray-700">
          ใบเสร็จ — {paperWidth}
          {autoPrint && <span className="ml-2 text-xs text-blue-500 font-normal">กำลังเตรียมพิมพ์...</span>}
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
      <div className="flex justify-center p-4 no-print-padding">
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-500 py-20">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>กำลังโหลด...</span>
          </div>
        ) : isError ? (
          <p className="text-red-600 py-20">ไม่สามารถโหลดข้อมูลได้</p>
        ) : data ? (
          <div className="bg-white shadow-md print-wrapper">
            <SaleReceipt sale={data} paperWidth={paperWidth} settings={settings} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
