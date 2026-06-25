'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CheckCircle2, Printer, Send, Home, Loader2, Smartphone, User } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { printRepairReceipt } from '@/lib/print'

interface RepairDetail {
  id: string; ticketNumber: string; createdAt: string; status: string
  customerName: string; customerPhone: string; isReturnCustomer?: boolean
  deviceType?: string; deviceBrand: string; deviceModel: string
  deviceImei?: string; deviceSerial?: string; deviceColor?: string
  issueTitle: string; issueDescription?: string; deviceCondition?: string
  accessories?: string | string[]; photos?: string[]
  laborCost?: number; partsCost?: number; estimatedCost?: number
  depositAmount?: number; technicianName?: string
}

const STATUS_LABEL: Record<string,string> = {
  RECEIVED:'รับเครื่องแล้ว', IN_PROGRESS:'กำลังซ่อม', PENDING:'รอตรวจสอบ',
}
const STATUS_STYLE: Record<string,string> = {
  RECEIVED:'bg-blue-50 text-blue-600', IN_PROGRESS:'bg-amber-50 text-amber-600',
  PENDING:'bg-slate-100 text-slate-500',
}

function Row({ label, value, highlight }: { label: string; value?: string | number; highlight?: boolean }) {
  if (!value && value !== 0) return null
  return (
    <div className="flex items-start justify-between gap-2 py-2.5 border-b border-[#F8F9FB] last:border-0">
      <span className="text-[12px] text-slate-400 shrink-0">{label}</span>
      <span className={`text-right text-[13px] font-semibold ${highlight ? 'text-emerald-600 text-[15px]' : 'text-[#111]'}`}>{value}</span>
    </div>
  )
}

function SuccessContent() {
  const router = useRouter()
  const params = useSearchParams()
  const id     = params.get('id')

  const [repair,  setRepair]  = useState<RepairDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!id) { setLoading(false); return }
    api.get(`/repairs/${id}`)
      .then(r => setRepair(r.data))
      .catch(() => toast.error('ไม่พบข้อมูลงานซ่อม'))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="h-7 w-7 animate-spin text-[#FFC107]"/>
      </div>
    )
  }

  const fmt = (n?: number) => n ? n.toLocaleString('th-TH') + ' บาท' : undefined
  const fmtDate = (s?: string) => {
    if (!s) return ''
    const d = new Date(s)
    return d.toLocaleDateString('th-TH', { day:'2-digit', month:'short', year:'numeric' }) + ' ' +
           d.toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' }) + ' น.'
  }

  const labor   = repair?.laborCost   ?? 0
  const parts   = repair?.partsCost   ?? 0
  const total   = repair?.estimatedCost ?? (labor + parts)
  const deposit = repair?.depositAmount ?? 0
  const remain  = total - deposit

  const accessories = repair?.accessories
    ? (Array.isArray(repair.accessories) ? repair.accessories : JSON.parse(repair.accessories as string))
    : []
  const conditions = repair?.deviceCondition
    ? repair.deviceCondition.split(',').map(s=>s.trim()).filter(Boolean)
    : []
  const symptoms = repair?.issueTitle
    ? repair.issueTitle.split(',').map(s=>s.trim()).filter(Boolean)
    : []

  function handlePrint() {
    if (!repair) return
    printRepairReceipt(repair.id, { paperWidth: '80mm' })
  }
  function handleQueue() {
    toast.success('ส่งเข้าคิวช่างแล้ว')
    router.push('/staff/repairs')
  }

  return (
      <div className="min-h-screen bg-[#F8F9FB] pb-36">

        {/* ── Success banner ── */}
        <div className={`relative overflow-hidden bg-white px-6 pb-8 pt-14 text-center transition-all duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {['#FFC107','#22C55E','#EF4444','#3B82F6','#8B5CF6'].map((c,i) => (
            <div key={i} className="pointer-events-none absolute h-2.5 w-2.5 rounded-full opacity-70"
              style={{ backgroundColor:c, top:`${15+i*8}%`, left:`${10+i*16}%`, transform:'rotate(45deg)' }}/>
          ))}
          {['#FFC107','#EF4444','#22C55E'].map((c,i) => (
            <div key={i} className="pointer-events-none absolute h-2 w-2 rounded-full opacity-60"
              style={{ backgroundColor:c, top:`${20+i*10}%`, right:`${12+i*12}%` }}/>
          ))}

          <div className={`inline-flex h-[72px] w-[72px] items-center justify-center rounded-full bg-emerald-500 shadow-[0_8px_32px_rgba(34,197,94,0.35)] transition-all duration-500 delay-200 ${mounted ? 'scale-100' : 'scale-50'}`}>
            <CheckCircle2 className="h-10 w-10 text-white" strokeWidth={2.5}/>
          </div>

          <h2 className={`mt-4 text-[18px] font-extrabold text-[#111] transition-all duration-500 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            บันทึกงานซ่อมสำเร็จ!
          </h2>

          {repair && (
            <div className={`mt-3 transition-all duration-500 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <p className="text-[12px] text-slate-400">หมายเลขงาน</p>
              <p className="text-[28px] font-extrabold tracking-wide text-[#111]">{repair.ticketNumber}</p>
              <p className="text-[12px] text-slate-400">{fmtDate(repair.createdAt)}</p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4 p-4">

          {/* ── Customer ── */}
          {repair && (
            <div className={`rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-500 delay-[500ms] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
              <p className="mb-3 text-[13px] font-bold text-[#111]">ข้อมูลลูกค้า</p>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFC107] text-sm font-bold text-[#111]">
                  <User className="h-5 w-5"/>
                </div>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-[#111]">{repair.customerName}</p>
                  <p className="text-[12px] text-slate-400">{repair.customerPhone}</p>
                </div>
                {repair.isReturnCustomer && (
                  <span className="rounded-full bg-[#FFF8E7] px-2.5 py-1 text-[10px] font-bold text-[#F59E0B]">ลูกค้าเก่า</span>
                )}
              </div>
            </div>
          )}

          {/* ── Device info ── */}
          {repair && (
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-3 text-[13px] font-bold text-[#111]">ข้อมูลอุปกรณ์</p>
              <div className="flex flex-col">
                <Row label="ประเภท"      value={repair.deviceType === 'mobile' ? 'มือถือ' : repair.deviceType}/>
                <Row label="ยี่ห้อ / รุ่น" value={`${repair.deviceBrand} / ${repair.deviceModel}`}/>
                <Row label="IMEI"         value={repair.deviceImei}/>
                <Row label="Serial Number" value={repair.deviceSerial}/>
                <Row label="สีเครื่อง"    value={repair.deviceColor}/>
              </div>
            </div>
          )}

          {/* ── Symptoms ── */}
          {symptoms.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-3 text-[13px] font-bold text-[#111]">อาการเสีย</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {symptoms.map(s => (
                  <span key={s} className="rounded-full bg-[#FFF8E7] px-3 py-1.5 text-[12px] font-semibold text-[#F59E0B]">{s}</span>
                ))}
              </div>
              {repair?.issueDescription && <p className="text-[12px] text-slate-500">{repair.issueDescription}</p>}
            </div>
          )}

          {/* ── Condition + photos ── */}
          {(conditions.length > 0 || (repair?.photos && repair.photos.length > 0)) && (
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              {conditions.length > 0 && (
                <>
                  <p className="mb-3 text-[13px] font-bold text-[#111]">สภาพเครื่องก่อนซ่อม</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {conditions.map(c => (
                      <span key={c} className="flex items-center gap-1 text-[12px] text-slate-600">
                        <span className="text-emerald-500 font-bold">✓</span> {c}
                      </span>
                    ))}
                  </div>
                </>
              )}
              {repair?.photos && repair.photos.length > 0 && (
                <>
                  <p className="mb-2 text-[13px] font-bold text-[#111]">รูปภาพก่อนซ่อม</p>
                  <div className="grid grid-cols-4 gap-2">
                    {repair.photos.slice(0,4).map((url, i) => (
                      <img key={i} src={url} className="aspect-square w-full rounded-xl object-cover" alt=""/>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Accessories ── */}
          {accessories.length > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-3 text-[13px] font-bold text-[#111]">อุปกรณ์ที่ฝาก</p>
              <div className="flex flex-wrap gap-2">
                {accessories.map((a: string) => (
                  <span key={a} className="flex items-center gap-1.5 rounded-full border border-[#E5E7EB] bg-[#F8F9FB] px-3 py-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-slate-400"/>
                    <span className="text-[12px] font-semibold text-slate-600">{a}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Pricing ── */}
          {total > 0 && (
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-2 text-[13px] font-bold text-[#111]">ค่าบริการ</p>
              <div className="flex flex-col">
                {labor > 0  && <Row label="ค่าแรง"    value={fmt(labor)}/>}
                {parts > 0  && <Row label="ค่าอะไหล่" value={fmt(parts)}/>}
                <Row label="รวม"       value={fmt(total)}   highlight/>
                {deposit > 0 && <Row label="รับมัดจำ" value={fmt(deposit)}/>}
                {deposit > 0 && remain > 0 && <Row label="คงเหลือ"   value={fmt(remain)}/>}
              </div>
            </div>
          )}

          {/* ── Technician + Status ── */}
          {repair && (
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              {repair.technicianName && (
                <div className="mb-3 flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F8F9FB]">
                    <User className="h-5 w-5 text-slate-400"/>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400">ผู้รับผิดชอบ</p>
                    <p className="text-[13px] font-bold text-[#111]">{repair.technicianName}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-slate-400">สถานะ</p>
                <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${STATUS_STYLE[repair.status] ?? 'bg-slate-100 text-slate-500'}`}>
                  {STATUS_LABEL[repair.status] ?? repair.status}
                </span>
              </div>
            </div>
          )}

        </div>

        {/* ── Bottom actions ── */}
        <div className="fixed bottom-0 left-0 right-0 flex flex-col gap-2.5 bg-[#F8F9FB] px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
          <button
            onClick={handlePrint}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFC107] text-[15px] font-bold text-[#111] shadow-[0_4px_20px_rgba(255,193,7,0.4)] active:scale-[0.98] transition-transform"
          >
            <Printer className="h-5 w-5"/> พิมพ์ใบรับซ่อม
          </button>
          <button
            onClick={handleQueue}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white text-[14px] font-semibold text-[#111] active:bg-slate-50"
          >
            <Send className="h-4 w-4"/> ส่งเข้าคิวช่าง
          </button>
          <button
            onClick={() => router.replace('/staff/home')}
            className="flex h-10 w-full items-center justify-center gap-2 text-[13px] font-medium text-slate-400"
          >
            <Home className="h-4 w-4"/> กลับหน้าหลัก
          </button>
        </div>
      </div>
  )
}

export default function SuccessPage() {
  return <Suspense><SuccessContent/></Suspense>
}
