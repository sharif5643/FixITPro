'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import { Printer, X } from 'lucide-react'
import api from '@/lib/api'
import type { Repair, ShopSettings } from '@/types'

type PaperWidth = 'A5' | '80mm' | '58mm'

interface WarrantyRecord {
  id:             string
  warrantyNumber: string
  status:         string
  startDate:      string
  endDate:        string
  description?:   string
  notes?:         string
  customer?:      { name: string; phone: string }
  repair?:        { ticketNumber: string; deviceBrand: string; deviceModel: string }
}

function fmtDate(d: string) {
  return format(new Date(d), 'd MMM yyyy', { locale: th })
}

// ─── Thermal layout (58mm / 80mm) ────────────────────────────────────────────
function ThermalCard({
  shopName, shopPhone, shopAddress,
  wNumber, ticketNumber, customerName, customerPhone,
  deviceText, imei, startDate, endDate, daysLeft, isExpired, wDesc,
}: {
  shopName: string; shopPhone: string; shopAddress: string
  wNumber: string; ticketNumber: string; customerName: string; customerPhone: string
  deviceText: string; imei: string; startDate: string; endDate: string
  daysLeft: number; isExpired: boolean; wDesc: string
}) {
  return (
    <div style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif", fontSize: 12, lineHeight: 1.5, color: '#000', padding: '4px 0' }}>
      {/* Header */}
      <div style={{ textAlign: 'center', borderBottom: '1px dashed #000', paddingBottom: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 11, letterSpacing: 2 }}>ใบรับประกัน</div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{shopName}</div>
        {shopAddress && <div style={{ fontSize: 10 }}>{shopAddress}</div>}
        {shopPhone   && <div style={{ fontSize: 10 }}>โทร {shopPhone}</div>}
      </div>

      {/* Warranty number */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: '#555' }}>เลขประกัน</div>
        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{wNumber}</div>
        <div style={{
          display: 'inline-block', fontSize: 10, fontWeight: 700, padding: '1px 8px',
          border: '1px solid', borderRadius: 20, marginTop: 2,
          color: isExpired ? '#c00' : '#007700',
          borderColor: isExpired ? '#c00' : '#007700',
        }}>
          {isExpired ? 'หมดประกัน' : 'อยู่ในประกัน'}
        </div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />

      {/* Info rows */}
      {[
        ['เลขงาน',   ticketNumber],
        ['ลูกค้า',   customerName],
        ['เบอร์',    customerPhone],
        ['อุปกรณ์',  deviceText],
        ...(imei ? [['IMEI', imei]] : []),
      ].map(([label, value]) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
          <span style={{ color: '#555', minWidth: 52 }}>{label}</span>
          <span style={{ fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>{value}</span>
        </div>
      ))}

      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

      {/* Period */}
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <div style={{ fontSize: 10, color: '#555' }}>ระยะประกัน</div>
        <div style={{ fontSize: 11 }}>{fmtDate(startDate)} → {fmtDate(endDate)}</div>
        {!isExpired && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#007700' }}>เหลืออีก {daysLeft} วัน</div>
        )}
      </div>

      {wDesc && (
        <>
          <div style={{ borderTop: '1px dashed #000', margin: '4px 0' }} />
          <div style={{ fontSize: 10, color: '#555' }}>เงื่อนไข: {wDesc}</div>
        </>
      )}

      <div style={{ borderTop: '1px dashed #000', margin: '6px 0' }} />

      {/* Terms */}
      <div style={{ fontSize: 10, color: '#444' }}>
        <div>• ประกันครอบคลุมการซ่อมโดยร้านเท่านั้น</div>
        <div>• ไม่ครอบคลุมอุบัติเหตุ/น้ำเข้า/แก้ไขภายนอก</div>
        <div>• กรุณานำใบนี้มาแสดงเมื่อเคลม</div>
      </div>

      <div style={{ borderTop: '1px dashed #000', margin: '8px 0 4px' }} />

      {/* Signatures */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderBottom: '1px solid #000', height: 24, marginBottom: 2 }} />
          <div style={{ fontSize: 10 }}>ผู้ให้บริการ</div>
        </div>
        <div style={{ textAlign: 'center', width: '40%' }}>
          <div style={{ borderBottom: '1px solid #000', height: 24, marginBottom: 2 }} />
          <div style={{ fontSize: 10 }}>ลูกค้า</div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontSize: 9, color: '#aaa', marginTop: 8 }}>
        {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
      </div>
    </div>
  )
}

// ─── A5 layout ────────────────────────────────────────────────────────────────
function A5Card({
  shopName, shopPhone, shopAddress,
  wNumber, ticketNumber, customerName, customerPhone,
  deviceText, imei, startDate, endDate, daysLeft, isExpired, wDesc,
}: Parameters<typeof ThermalCard>[0]) {
  return (
    <div
      className="mx-auto bg-white shadow-lg print:shadow-none"
      style={{ maxWidth: 420, minHeight: 594, padding: '24px 28px', fontFamily: "'Sarabun','Noto Sans Thai',sans-serif" }}
    >
      <div className="text-center border-b-2 border-slate-800 pb-3 mb-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-1">ใบรับประกัน</p>
        <h1 className="text-2xl font-extrabold text-slate-900">{shopName}</h1>
        {shopAddress && <p className="text-xs text-slate-500 mt-0.5">{shopAddress}</p>}
        {shopPhone   && <p className="text-xs text-slate-500">โทร {shopPhone}</p>}
      </div>

      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-xs text-slate-400 uppercase tracking-wide">เลขประกัน</p>
          <p className="text-lg font-extrabold font-mono text-slate-900">{wNumber}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${isExpired ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
          {isExpired ? 'หมดประกัน' : 'อยู่ในประกัน'}
        </div>
      </div>

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

      <hr className="border-dashed border-slate-300 mb-5" />

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
            <p className={`text-sm font-bold ${isExpired ? 'text-red-600' : 'text-green-700'}`}>{fmtDate(endDate)}</p>
          </div>
        </div>
        {!isExpired && <p className="text-center text-xs text-green-600 font-semibold mt-2">เหลืออีก {daysLeft} วัน</p>}
      </div>

      {wDesc && (
        <div className="mb-5">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">เงื่อนไขประกัน</p>
          <p className="text-xs text-slate-600 leading-relaxed">{wDesc}</p>
        </div>
      )}

      <div className="mb-6">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-1">ข้อกำหนดทั่วไป</p>
        <ul className="text-[11px] text-slate-500 space-y-0.5 leading-relaxed">
          <li>• ประกันครอบคลุมการซ่อมที่ดำเนินการโดยร้านเท่านั้น</li>
          <li>• ไม่ครอบคลุมความเสียหายจากอุบัติเหตุ น้ำเข้า หรือการแก้ไขภายนอก</li>
          <li>• กรุณานำใบนี้มาแสดงทุกครั้งที่มาใช้สิทธิ์ประกัน</li>
          <li>• โปรดเก็บใบรับประกันไว้ตลอดระยะเวลาประกัน</li>
        </ul>
      </div>

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

      <p className="text-center text-[10px] text-slate-300 mt-4">
        ออกโดย {shopName} · {format(new Date(), 'd MMM yyyy HH:mm', { locale: th })}
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function WarrantyCardPage() {
  const params        = useParams<{ repairId: string }>()
  const repairId      = params?.repairId ?? ''
  const initPaper     = (typeof window !== 'undefined'
    ? (new URLSearchParams(window.location.search).get('paper') as PaperWidth)
    : null) ?? 'A5'
  const [paper, setPaper] = useState<PaperWidth>(initPaper)
  const printedRef    = useRef(false)
  const isThermal     = paper === '80mm' || paper === '58mm'

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

  const { data: warrantyList } = useQuery<{ items: WarrantyRecord[] }>({
    queryKey: ['warranties-by-repair', repairId],
    queryFn:  async () => (await api.get(`/warranties?repairId=${repairId}&limit=1`)).data,
    enabled:  !!repairId,
    staleTime: 300_000,
  })

  const warranty = warrantyList?.items?.[0]
  const ready    = !!repair && !!settings

  // Inject @page size when paper changes
  useEffect(() => {
    const style = document.createElement('style')
    style.id = 'print-page-size'
    style.textContent = isThermal
      ? `@page { size: ${paper} auto; margin: 2mm; } @media print { .no-print { display: none !important; } html,body { background:#fff!important; margin:0!important; padding:0!important; } }`
      : `@page { size: A5 portrait; margin: 10mm; } @media print { .no-print { display: none !important; } html,body { background:#fff!important; margin:0!important; padding:0!important; } }`
    document.head.appendChild(style)
    return () => document.getElementById('print-page-size')?.remove()
  }, [paper, isThermal])

  // Auto-print once
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
  const wDesc     = warranty?.description ?? warNote ?? ''

  const daysLeft  = Math.max(0, Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000))
  const isExpired = new Date(endDate) < new Date()

  const cardProps = { shopName, shopPhone, shopAddress, wNumber, ticketNumber, customerName, customerPhone, deviceText, imei, startDate, endDate, daysLeft, isExpired, wDesc }

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-screen text-slate-400 text-sm">
        กำลังโหลดข้อมูลใบรับประกัน…
      </div>
    )
  }

  return (
    <>
      {/* Action bar */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between z-50 shadow-sm">
        <p className="text-sm font-medium text-slate-700">ใบรับประกัน — {ticketNumber}</p>
        <div className="flex items-center gap-2">
          {/* Paper size selector */}
          <div className="flex rounded-md border border-slate-200 overflow-hidden text-xs">
            {(['A5', '80mm', '58mm'] as PaperWidth[]).map((p) => (
              <button
                key={p}
                onClick={() => setPaper(p)}
                className={`px-2.5 py-1 font-medium transition-colors ${paper === p ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {p === 'A5' ? 'A5' : p}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            <Printer className="h-3.5 w-3.5" />
            พิมพ์
          </button>
          <button
            onClick={() => window.close()}
            className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium bg-slate-100 text-slate-600 rounded hover:bg-slate-200 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className={isThermal ? 'pt-12 flex justify-center' : 'pt-14'}>
        {isThermal ? (
          <div style={{ width: paper === '58mm' ? 200 : 280, padding: '8px 6px', background: '#fff' }}>
            <ThermalCard {...cardProps} />
          </div>
        ) : (
          <A5Card {...cardProps} />
        )}
      </div>
    </>
  )
}
