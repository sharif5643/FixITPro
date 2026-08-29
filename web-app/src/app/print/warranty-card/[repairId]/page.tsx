'use client'

import { useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { Repair, ShopSettings } from '@/types'

interface WarrantyRecord {
  id:              string
  warrantyNumber:  string
  status:          string
  startDate:       string
  endDate:         string
  description?:    string
  notes?:          string
  customer?:       { name: string; phone: string }
  repair?:         { ticketNumber: string; deviceBrand: string; deviceModel: string }
}

function fmtDate(d: string) {
  return format(new Date(d), 'd MMM yyyy', { locale: th })
}

export default function WarrantyCardPage() {
  const { repairId } = useParams<{ repairId: string }>()
  const printedRef   = useRef(false)

  const { data: repair } = useQuery<Repair>({
    queryKey: ['repairs', repairId],
    queryFn:  async () => (await api.get(`/repairs/${repairId}`)).data,
    staleTime: 300_000,
  })

  const { data: settings } = useQuery<ShopSettings>({
    queryKey: ['settings'],
    queryFn:  async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  // Fetch warranty record for this repair
  const { data: warrantyList } = useQuery<{ items: WarrantyRecord[] }>({
    queryKey: ['warranties-by-repair', repairId],
    queryFn:  async () => (await api.get(`/warranties?repairId=${repairId}&limit=1`)).data,
    enabled:  !!repairId,
    staleTime: 300_000,
  })

  const warranty = warrantyList?.items?.[0]
  const ready    = !!repair && !!settings

  // Auto-print once data loads
  useEffect(() => {
    if (ready && !printedRef.current) {
      printedRef.current = true
      const t = setTimeout(() => window.print(), 600)
      return () => clearTimeout(t)
    }
  }, [ready])

  const shopName    = settings?.shopName    ?? 'ร้านซ่อม'
  const shopAddress = settings?.shopAddress ?? ''
  const shopPhone   = settings?.shopPhone   ?? ''

  const customerName  = repair?.customer?.name  ?? '—'
  const customerPhone = repair?.customer?.phone ?? '—'
  const deviceText    = repair ? `${repair.deviceBrand} ${repair.deviceModel}` : '—'
  const ticketNumber  = repair?.ticketNumber ?? '—'
  const imei          = repair?.deviceImei ?? ''
  const warNote       = repair?.warrantyNote ?? ''

  const startDate = warranty?.startDate ?? repair?.completedAt ?? repair?.deliveredAt ?? new Date().toISOString()
  const endDate   = warranty?.endDate   ?? repair?.warrantyExpiresAt ?? new Date().toISOString()
  const wNumber   = warranty?.warrantyNumber ?? '—'
  const wDesc     = warranty?.description   ?? warNote ?? ''

  // Days remaining
  const daysLeft  = Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000))
  const isExpired = new Date(endDate) < new Date()

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm">
        กำลังโหลดข้อมูลใบรับประกัน…
      </div>
    )
  }

  return (
    <>
      <style>{`
        @page { size: A5 portrait; margin: 10mm; }
        @media print {
          html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
          .no-print  { display: none !important; }
        }
        body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; }
      `}</style>

      {/* Action bar */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between z-50 shadow-sm">
        <p className="text-sm font-medium text-slate-700">ใบรับประกัน — {ticketNumber}</p>
        <div className="flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            พิมพ์
          </button>
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
            ปิด
          </button>
        </div>
      </div>

      {/* Card */}
      <div className="pt-14 no-print-padding print:pt-0">
        <div
          className="mx-auto bg-white shadow-lg print:shadow-none"
          style={{ maxWidth: 420, minHeight: 594, padding: '24px 28px', fontFamily: "'Sarabun', 'Noto Sans Thai', sans-serif" }}
        >
          {/* Header */}
          <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">ใบรับประกัน</p>
            <h1 className="text-2xl font-extrabold text-slate-900">{shopName}</h1>
            {shopAddress && <p className="text-xs text-slate-500 mt-0.5">{shopAddress}</p>}
            {shopPhone   && <p className="text-xs text-slate-500">โทร {shopPhone}</p>}
          </div>

          {/* Warranty number + status */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="text-xs text-slate-400 uppercase tracking-wide">เลขประกัน</p>
              <p className="text-lg font-extrabold font-mono text-slate-900">{wNumber}</p>
            </div>
            <div
              className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide
                ${isExpired
                  ? 'bg-red-100 text-red-700'
                  : 'bg-green-100 text-green-700'}`}
            >
              {isExpired ? 'หมดประกัน' : 'อยู่ในประกัน'}
            </div>
          </div>

          {/* Customer & Device */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 mb-5">
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">ลูกค้า</p>
              <p className="text-sm font-semibold text-slate-800">{customerName}</p>
              <p className="text-xs text-slate-500">{customerPhone}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">เลขงานซ่อม</p>
              <p className="text-sm font-mono font-semibold text-slate-800">{ticketNumber}</p>
            </div>
            <div>
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold">อุปกรณ์</p>
              <p className="text-sm font-semibold text-slate-800">{deviceText}</p>
              {imei && <p className="text-xs text-slate-400 font-mono">IMEI: {imei}</p>}
            </div>
          </div>

          {/* Divider */}
          <hr className="border-dashed border-slate-300 mb-5" />

          {/* Warranty period */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 mb-5">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-3">ระยะเวลารับประกัน</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-center">
                <p className="text-xs text-slate-400 mb-0.5">วันที่เริ่ม</p>
                <p className="text-sm font-bold text-slate-700">{fmtDate(startDate)}</p>
              </div>
              <div className="text-slate-300 text-lg font-light">→</div>
              <div className="flex-1 text-center">
                <p className="text-xs text-slate-400 mb-0.5">วันหมดประกัน</p>
                <p className={`text-sm font-bold ${isExpired ? 'text-red-600' : 'text-green-700'}`}>
                  {fmtDate(endDate)}
                </p>
              </div>
            </div>
            {!isExpired && (
              <p className="text-center text-xs text-green-600 font-semibold mt-2">
                เหลืออีก {daysLeft} วัน
              </p>
            )}
          </div>

          {/* Description / Terms */}
          {wDesc && (
            <div className="mb-5">
              <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">เงื่อนไขประกัน</p>
              <p className="text-xs text-slate-600 leading-relaxed">{wDesc}</p>
            </div>
          )}

          {/* Default terms */}
          <div className="mb-6">
            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">ข้อกำหนดทั่วไป</p>
            <ul className="text-[11px] text-slate-500 space-y-0.5 leading-relaxed">
              <li>• ประกันครอบคลุมการซ่อมที่ดำเนินการโดยร้านเท่านั้น</li>
              <li>• ไม่ครอบคลุมความเสียหายจากอุบัติเหตุ น้ำเข้า หรือการแก้ไขภายนอก</li>
              <li>• กรุณานำใบนี้มาแสดงทุกครั้งที่มาใช้สิทธิ์ประกัน</li>
              <li>• โปรดเก็บใบรับประกันไว้ตลอดระยะเวลาประกัน</li>
            </ul>
          </div>

          {/* Signature */}
          <div className="flex justify-between pt-4 border-t border-slate-200 mt-auto">
            <div className="text-center w-36">
              <div className="border-b border-slate-400 mb-1 h-8" />
              <p className="text-xs text-slate-500">ผู้ให้บริการ</p>
            </div>
            <div className="text-center w-36">
              <div className="border-b border-slate-400 mb-1 h-8" />
              <p className="text-xs text-slate-500">ลูกค้า</p>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-[10px] text-slate-300 mt-4">
            ออกโดย {shopName} · {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
          </p>
        </div>
      </div>
    </>
  )
}
