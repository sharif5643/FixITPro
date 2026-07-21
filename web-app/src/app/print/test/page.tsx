'use client'

import { Suspense, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Printer, X } from 'lucide-react'

type PW = '58mm' | '80mm'

function TestPrintContent() {
  const searchParams  = useSearchParams()
  const paperWidth    = (searchParams.get('paper') as PW) || '80mm'
  const autoPrint     = searchParams.get('autoprint') === '1'
  const printFiredRef = useRef(false)

  useEffect(() => {
    const style = document.createElement('style')
    style.id    = 'print-page-size'
    style.textContent = `
      @page { size: ${paperWidth} auto; margin: 2mm; }
      @media print {
        html, body { min-height: auto !important; background: #fff !important; margin: 0 !important; padding: 0 !important; }
        .no-print { display: none !important; }
      }
    `
    document.head.appendChild(style)
    return () => document.getElementById('print-page-size')?.remove()
  }, [paperWidth])

  useEffect(() => {
    const handler = () => window.opener?.postMessage('receipt-afterprint', '*')
    window.addEventListener('afterprint', handler)
    return () => window.removeEventListener('afterprint', handler)
  }, [])

  useEffect(() => {
    if (!autoPrint || printFiredRef.current) return
    printFiredRef.current = true
    const t = setTimeout(() => {
      window.print()
      setTimeout(() => window.close(), 1000)
    }, 400)
    return () => clearTimeout(t)
  }, [autoPrint])

  const now    = new Date().toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' })
  const lineW  = paperWidth === '58mm' ? 200 : 280

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 bg-white border-b px-4 py-2 shadow-sm">
        <span className="text-sm font-semibold text-gray-700">
          ใบเสร็จทดสอบ — {paperWidth}
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

      <div className="flex justify-center p-4">
        <div className="bg-white shadow-md p-4 font-mono text-xs" style={{ width: `${lineW}px` }}>
          <div className="text-center space-y-0.5 border-b border-dashed pb-2 mb-2">
            <p className="font-bold text-sm">*** ทดสอบเครื่องพิมพ์ ***</p>
            <p className="text-xs text-gray-500">{now}</p>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>สินค้าทดสอบ 1</span><span>×1  ฿100</span></div>
            <div className="flex justify-between"><span>สินค้าทดสอบ 2</span><span>×2  ฿200</span></div>
          </div>
          <div className="border-t border-dashed mt-2 pt-2 space-y-1">
            <div className="flex justify-between"><span>ยอดรวม</span><span>฿300</span></div>
            <div className="flex justify-between font-bold border-t border-dashed pt-1 mt-1">
              <span>ยอดสุทธิ</span><span>฿300</span>
            </div>
          </div>
          <div className="text-center mt-3 border-t border-dashed pt-2 text-gray-500">
            <p>*** ใบเสร็จทดสอบ — ไม่ใช่ใบเสร็จจริง ***</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function TestPrintPage() {
  return (
    <Suspense>
      <TestPrintContent />
    </Suspense>
  )
}
