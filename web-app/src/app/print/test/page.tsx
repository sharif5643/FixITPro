'use client'

import { Suspense, useEffect, useRef, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { ShopSettings } from '@/types'

type PW = '58mm' | '80mm'

function TestPrintContent() {
  const searchParams  = useSearchParams()
  const router        = useRouter()
  const paperWidth    = (searchParams.get('paper') as PW) || '80mm'
  const autoPrint     = searchParams.get('autoprint') === '1'
  const printFiredRef = useRef(false)

  const switchPaper = useCallback((pw: PW) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('paper', pw)
    params.delete('autoprint')
    router.replace(`?${params.toString()}`)
  }, [searchParams, router])

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn: async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  useEffect(() => {
    const style = document.createElement('style')
    style.id    = 'print-page-size'
    style.textContent = `
      @page { size: ${paperWidth} auto; margin: 0mm; }
      @media print {
        html, body { min-height: 0 !important; height: auto !important; background: #fff !important; margin: 0 !important; padding: 0 !important; }
        .no-print { display: none !important; }
        .print-outer  { display: block !important; padding: 0 !important; min-height: 0 !important; background: transparent !important; }
        .print-mid    { display: block !important; padding: 0 !important; }
        .print-wrapper { display: block !important; padding: 0 !important; margin: 0 !important; box-shadow: none !important; background: transparent !important; }
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
  const lineW  = paperWidth === '58mm' ? 200 : 300

  const logoUrl   = settings?.logoUrl   || ''
  const shopName  = settings?.shopName  || 'FixITPro'
  const shopPhone = settings?.shopPhone || ''

  const Divider = () => <div className="border-b border-dashed border-gray-400 my-2" />

  return (
    <div className="min-h-screen bg-gray-100 print-outer">
      <div className="no-print sticky top-0 z-10 bg-white border-b shadow-sm">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2">
          <span className="text-sm font-semibold text-gray-700">ทดสอบการพิมพ์</span>
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

        {/* Paper size switcher */}
        <div className="flex items-center gap-3 px-4 pb-3">
          <span className="text-xs text-gray-500 shrink-0">ขนาดกระดาษ:</span>
          <div className="flex gap-2">
            {(['58mm', '80mm'] as const).map((pw) => {
              const active = paperWidth === pw
              const barW   = pw === '58mm' ? 30 : 42
              return (
                <button
                  key={pw}
                  onClick={() => switchPaper(pw)}
                  className={[
                    'flex items-center gap-2 rounded-lg border-2 px-3 py-1.5 text-xs font-semibold transition-all',
                    active
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                  ].join(' ')}
                >
                  {/* Mini paper diagram */}
                  <span
                    className={[
                      'inline-block rounded-sm border',
                      active ? 'border-blue-400 bg-blue-200' : 'border-gray-300 bg-gray-100',
                    ].join(' ')}
                    style={{ width: barW, height: 16 }}
                  />
                  {pw}
                  {active && <span className="text-blue-500">✓</span>}
                </button>
              )
            })}
          </div>
          <span className="text-xs text-gray-400">
            {paperWidth === '58mm' ? 'เครื่องพิมพ์ขนาดเล็ก' : 'เครื่องพิมพ์มาตรฐาน'}
          </span>
        </div>
      </div>

      <div className="flex justify-center p-4 print-mid">
        <div className="bg-white shadow-md print-wrapper font-mono text-[11px] leading-relaxed" style={{ width: `${lineW}px` }}>
          {/* Shop header — matches real receipt */}
          <div className="text-center space-y-0.5 pb-2">
            {logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <div className="flex justify-center mb-1">
                <img src={logoUrl} alt="logo" className="h-10 w-auto object-contain" />
              </div>
            )}
            <p className="font-bold text-sm tracking-widest">{shopName}</p>
            {shopPhone && <p>โทร: {shopPhone}</p>}
          </div>
          <Divider />

          {/* Test label */}
          <div className="text-center space-y-0.5 pb-1">
            <p className="font-bold">*** ทดสอบเครื่องพิมพ์ ***</p>
            <p className="text-gray-600">{now}</p>
          </div>
          <Divider />

          {/* Dummy items */}
          <div className="space-y-1 pb-1">
            <div className="flex justify-between"><span>สินค้าทดสอบ 1</span><span>×1  ฿100.00</span></div>
            <div className="flex justify-between"><span>สินค้าทดสอบ 2</span><span>×2  ฿200.00</span></div>
          </div>
          <Divider />

          {/* Totals */}
          <div className="space-y-1 pb-1">
            <div className="flex justify-between"><span>ยอดรวม</span><span>฿300.00</span></div>
          </div>
          <Divider />
          <div className="flex justify-between font-bold pb-1">
            <span>ยอดสุทธิ</span><span>฿300.00</span>
          </div>
          <Divider />

          {/* Footer */}
          <div className="text-center space-y-0.5 pt-1 pb-2 text-gray-500">
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
