'use client'

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
      @page { size: ${paperWidth === 'A4' ? 'A4 portrait' : `${paperWidth} auto`}; margin: ${paperWidth === 'A4' ? '10mm' : '3mm'}; }
      @media print { .no-print { display: none !important; } }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-page-size')?.remove()
  }, [paperWidth])

  // Auto-print after data loads (once only)
  useEffect(() => {
    if (data && !printed) {
      setPrinted(true)
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [data, printed])

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Print controls — hidden when printing */}
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b px-4 py-2 shadow-sm">
        <span className="text-sm font-semibold text-gray-700">
          ใบรับงานซ่อม — {paperWidth === 'A4' ? 'A4' : paperWidth}
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
            <RepairReceipt repair={data} paperWidth={paperWidth} settings={settings} trackingBaseUrl={origin} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
