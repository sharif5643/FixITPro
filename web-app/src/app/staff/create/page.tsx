'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Search, UserPlus, Smartphone, Tablet, Laptop,
  Monitor, MoreHorizontal, Camera, X, Loader2, Mic, ScanLine,
  ChevronDown,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

/* ─── Constants ──────────────────────────────────────────────────────── */
const DEVICE_TYPES = [
  { value:'mobile',  label:'มือถือ',     icon: Smartphone  },
  { value:'tablet',  label:'แท็บเล็ต',   icon: Tablet      },
  { value:'laptop',  label:'โน๊ตบุ๊ค',   icon: Laptop      },
  { value:'desktop', label:'คอมพิวเตอร์', icon: Monitor     },
  { value:'other',   label:'อื่นๆ',      icon: MoreHorizontal },
]
const BRANDS = ['Apple','Samsung','OPPO','Xiaomi','Vivo','Realme','Huawei','Nokia','Google','OnePlus','อื่นๆ']
const APPLE_MODELS = ['iPhone 16 Pro Max','iPhone 16 Pro','iPhone 16','iPhone 15 Pro Max','iPhone 15 Pro','iPhone 15','iPhone 14 Pro Max','iPhone 14 Pro','iPhone 14','iPhone 13 Pro Max','iPhone 13','iPhone 12','iPhone 11','iPhone SE','อื่นๆ']
const SAMSUNG_MODELS = ['Galaxy S25 Ultra','Galaxy S25+','Galaxy S24 Ultra','Galaxy S24','Galaxy A55','Galaxy A35','Galaxy A15','Galaxy Z Fold 6','Galaxy Z Flip 6','อื่นๆ']
const SYMPTOMS = ['จอแตก','แบตเสื่อม','ชาร์จไม่เข้า','ตกน้ำ','เปิดไม่ติด','ลำโพงเสีย','กล้องเสีย','สัญญาณไม่เข้า','อื่นๆ']
const CONDITIONS = ['จอแตก','ฝาหลังร้าว','เครื่องงอ','กล้องแตก','มีรอยตก/กระแทก','อื่นๆ ระบุ']
const ACCESSORIES = ['เครื่อง','ซิม','กล่อง','สายชาร์จ','เคส','เมมโมรี่การ์ด','อะแดปเตอร์','ฟิล์ม/กระจก','อื่นๆ']
const COLORS = [
  { label:'ดำ',   hex:'#111111' },
  { label:'ขาว',  hex:'#FFFFFF', border:true },
  { label:'น้ำเงิน', hex:'#2563EB' },
  { label:'ทอง',  hex:'#D4AF37' },
  { label:'เขียว', hex:'#16A34A' },
  { label:'อื่นๆ', hex:'#E5E7EB', border:true },
]
const STATUSES = [
  { value:'RECEIVED',    label:'รับเครื่องแล้ว'   },
  { value:'IN_PROGRESS', label:'กำลังซ่อม'        },
  { value:'PENDING',     label:'รอตรวจสอบ'        },
]

interface Customer { id: string; name: string; phone: string; totalRepairs?: number }
interface Employee  { id: string; name: string }

/* ─── Input/Field helpers ────────────────────────────────────────────── */
const IC = 'h-12 w-full rounded-xl border border-[#E5E7EB] bg-[#F8F9FB] px-4 text-sm text-[#111] outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20 transition-all'

function SectionHead({ num, title }: { num: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FFC107] text-[11px] font-extrabold text-[#111]">{num}</div>
      <p className="text-[14px] font-bold text-[#111]">{title}</p>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] ${className}`}>
      {children}
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────────────────── */
export default function CreateRepairPage() {
  const router = useRouter()

  // ── Customer ──
  const [phoneSearch,    setPhoneSearch]    = useState('')
  const [customers,      setCustomers]      = useState<Customer[]>([])
  const [searchLoading,  setSearchLoading]  = useState(false)
  const [selectedCust,   setSelectedCust]   = useState<Customer | null>(null)
  const [newCustName,    setNewCustName]     = useState('')
  const [newCustPhone,   setNewCustPhone]    = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Device ──
  const [deviceType,  setDeviceType]  = useState('mobile')
  const [brand,       setBrand]       = useState('')
  const [model,       setModel]       = useState('')
  const [imei,        setImei]        = useState('')
  const [serial,      setSerial]      = useState('')
  const [colorLabel,  setColorLabel]  = useState('')

  // ── Symptoms + Condition ──
  const [symptoms,   setSymptoms]   = useState<string[]>([])
  const [issueDesc,  setIssueDesc]  = useState('')
  const [conditions, setConditions] = useState<string[]>([])

  // ── Photos ──
  const [photos,     setPhotos]     = useState<{ label: string; file: File | null }[]>([
    { label:'ด้านหน้า', file:null }, { label:'ด้านหลัง', file:null },
    { label:'จุดเสียหาย', file:null }, { label:'อุปกรณ์ที่ฝาก', file:null },
  ])

  // ── Accessories ──
  const [accessories, setAccessories] = useState<string[]>(['เครื่อง'])

  // ── Pricing ──
  const [laborCost,  setLaborCost]  = useState('')
  const [partsCost,  setPartsCost]  = useState('')
  const [deposit,    setDeposit]    = useState('')

  // ── Assignment ──
  const [technicians, setTechnicians] = useState<Employee[]>([])
  const [techId,      setTechId]      = useState('')
  const [techName,    setTechName]    = useState('')
  const [status,      setStatus]      = useState('RECEIVED')

  const [loading, setLoading] = useState(false)

  const total = (parseFloat(laborCost)||0) + (parseFloat(partsCost)||0)
  const remaining = total - (parseFloat(deposit)||0)

  // Customer search with debounce
  const searchCustomers = useCallback((q: string) => {
    setPhoneSearch(q)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (q.length < 3) { setCustomers([]); return }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true)
      try {
        const r = await api.get(`/customers?search=${encodeURIComponent(q)}&limit=5`)
        const list = r.data?.data ?? r.data ?? []
        setCustomers(Array.isArray(list) ? list : [])
      } catch { setCustomers([]) }
      finally { setSearchLoading(false) }
    }, 400)
  }, [])

  // Load technicians on mount
  const loadTechs = useCallback(async () => {
    if (technicians.length) return
    try {
      const r = await api.get('/employees?role=TECHNICIAN&limit=50')
      const list = r.data?.data ?? r.data ?? []
      setTechnicians(Array.isArray(list) ? list : [])
    } catch { /* silent */ }
  }, [technicians.length])

  // Models list
  const modelOptions = brand === 'Apple' ? APPLE_MODELS : brand === 'Samsung' ? SAMSUNG_MODELS : []

  function toggleChip(arr: string[], set: (v:string[]) => void, val: string) {
    set(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  function setPhoto(idx: number, file: File) {
    setPhotos(prev => prev.map((p,i) => i===idx ? {...p, file} : p))
  }
  function removePhoto(idx: number) {
    setPhotos(prev => prev.map((p,i) => i===idx ? {...p, file:null} : p))
  }

  async function handleSubmit() {
    const custId    = selectedCust?.id
    const custName  = selectedCust?.name  || newCustName
    const custPhone = selectedCust?.phone || newCustPhone

    if (!custName || !custPhone) return toast.error('กรุณากรอกข้อมูลลูกค้า')
    if (!brand)                  return toast.error('กรุณาเลือกยี่ห้ออุปกรณ์')
    if (!model)                  return toast.error('กรุณาระบุรุ่นอุปกรณ์')
    if (!symptoms.length)        return toast.error('กรุณาเลือกอาการเสียอย่างน้อย 1 อาการ')

    setLoading(true)
    try {
      const fd = new FormData()
      if (custId) fd.append('customerId', custId)
      fd.append('customerName',  custName)
      fd.append('customerPhone', custPhone)
      fd.append('deviceType',    deviceType)
      fd.append('deviceBrand',   brand)
      fd.append('deviceModel',   model)
      if (imei)       fd.append('deviceImei',   imei)
      if (serial)     fd.append('deviceSerial', serial)
      if (colorLabel) fd.append('deviceColor',  colorLabel)
      fd.append('issueTitle',       symptoms.join(', '))
      fd.append('issueDescription', issueDesc)
      fd.append('deviceCondition',  conditions.join(', '))
      fd.append('accessories',      JSON.stringify(accessories))
      if (laborCost)  fd.append('laborCost',     laborCost)
      if (partsCost)  fd.append('partsCost',     partsCost)
      if (total)      fd.append('estimatedCost', String(total))
      if (deposit)    fd.append('depositAmount', deposit)
      if (techId)     fd.append('technicianId',  techId)
      if (techName)   fd.append('technicianName', techName)
      fd.append('status', status)
      photos.forEach(p => { if (p.file) fd.append('photos', p.file) })

      const res = await api.post('/repairs', fd, { headers:{'Content-Type':'multipart/form-data'} })
      router.replace(`/staff/create/success?id=${res.data?.id ?? res.data?.repair?.id}`)
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'บันทึกไม่สำเร็จ กรุณาลองใหม่')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB] pb-32">

      {/* ── Header ── */}
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-white px-5 pb-4 pt-14 shadow-sm">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
          <ChevronLeft className="h-5 w-5 text-slate-600"/>
        </button>
        <h1 className="flex-1 text-[17px] font-bold text-[#111]">รับงานซ่อมใหม่</h1>
        <button
          onClick={() => toast.info('สแกน IMEI: เล็งที่บาร์โค้ด/IMEI')}
          className="flex h-8 items-center gap-1.5 rounded-xl bg-[#FFF8E7] px-3 text-[11px] font-bold text-[#F59E0B]"
        >
          <ScanLine className="h-3.5 w-3.5"/> สแกน IMEI
        </button>
      </div>

      <div className="flex flex-col gap-4 p-4">

        {/* ① ข้อมูลลูกค้า */}
        <Card>
          <SectionHead num={1} title="ข้อมูลลูกค้า"/>

          {/* Search bar */}
          <div className="relative mb-3">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
            <input
              value={phoneSearch}
              onChange={e => searchCustomers(e.target.value)}
              placeholder="ค้นหาเบอร์โทร / ชื่อลูกค้า"
              inputMode="tel"
              className="h-11 w-full rounded-xl border border-[#E5E7EB] bg-[#F8F9FB] pl-10 pr-4 text-sm outline-none focus:border-[#FFC107]"
            />
            {searchLoading && <Loader2 className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"/>}
          </div>

          {/* Search results */}
          {customers.length > 0 && !selectedCust && (
            <div className="mb-3 flex flex-col gap-2">
              {customers.map(c => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white p-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFC107] text-sm font-bold text-[#111]">
                    {c.name.slice(0,1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-bold text-[#111]">{c.name}</p>
                    <p className="text-[11px] text-slate-400">{c.phone}</p>
                    {c.totalRepairs ? <p className="text-[10px] text-slate-400">ซ่อมมาแล้ว {c.totalRepairs} ครั้ง</p> : null}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => { setSelectedCust(c); setCustomers([]) }}
                      className="rounded-xl bg-[#FFC107] px-3 py-1.5 text-[12px] font-bold text-[#111]"
                    >เลือก</button>
                    <button onClick={() => router.push(`/staff/customers/${c.id}`)} className="text-[10px] text-[#3B82F6]">ดูประวัติ &rsaquo;</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Selected customer card */}
          {selectedCust && (
            <div className="mb-3 flex items-center gap-3 rounded-xl border-2 border-[#FFC107] bg-[#FFFBEB] p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FFC107] text-sm font-bold text-[#111]">
                {selectedCust.name.slice(0,1)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold text-[#111]">{selectedCust.name}</p>
                <p className="text-[11px] text-slate-500">{selectedCust.phone}</p>
                {selectedCust.totalRepairs ? <p className="text-[10px] text-slate-400">ซ่อมมาแล้ว {selectedCust.totalRepairs} ครั้ง</p> : null}
              </div>
              <button onClick={() => setSelectedCust(null)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm">
                <X className="h-4 w-4 text-slate-400"/>
              </button>
            </div>
          )}

          {/* New customer input (if no selected) */}
          {!selectedCust && (
            <>
              <div className="my-3 flex items-center gap-3">
                <div className="h-px flex-1 bg-[#E5E7EB]"/>
                <span className="text-[11px] text-slate-400">หรือ</span>
                <div className="h-px flex-1 bg-[#E5E7EB]"/>
              </div>
              <button
                onClick={() => { setNewCustName(''); setNewCustPhone(phoneSearch) }}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8F9FB] text-sm font-semibold text-slate-500"
              >
                <UserPlus className="h-4 w-4"/> ลูกค้าใหม่
              </button>
              {(newCustName !== undefined && newCustPhone !== undefined && !selectedCust) && newCustName === '' && (
                <></>
              )}
              <div className="mt-3 flex flex-col gap-2.5">
                <input value={newCustName} onChange={e=>setNewCustName(e.target.value)} placeholder="ชื่อ - นามสกุล *" className={IC}/>
                <input value={newCustPhone} onChange={e=>setNewCustPhone(e.target.value)} placeholder="เบอร์โทรศัพท์ *" type="tel" className={IC}/>
              </div>
            </>
          )}
        </Card>

        {/* ② ข้อมูลอุปกรณ์ */}
        <Card>
          <SectionHead num={2} title="ข้อมูลอุปกรณ์"/>

          {/* Device type */}
          <div className="mb-4 flex justify-between">
            {DEVICE_TYPES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                onClick={() => setDeviceType(value)}
                className={`flex flex-col items-center gap-1 rounded-xl p-2.5 transition-all ${deviceType===value ? 'bg-[#FFC107]/15 ring-2 ring-[#FFC107]' : 'bg-[#F8F9FB]'}`}
              >
                <Icon className={`h-6 w-6 ${deviceType===value ? 'text-[#F59E0B]' : 'text-slate-400'}`} strokeWidth={1.8}/>
                <span className={`text-[10px] font-semibold ${deviceType===value ? 'text-[#F59E0B]' : 'text-slate-400'}`}>{label}</span>
              </button>
            ))}
          </div>

          {/* Brand + Model */}
          <div className="mb-3 grid grid-cols-2 gap-2.5">
            <div className="relative">
              <select
                value={brand}
                onChange={e => { setBrand(e.target.value); setModel('') }}
                className={`${IC} appearance-none pr-8`}
              >
                <option value="">ยี่ห้อ *</option>
                {BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
            </div>
            <div className="relative">
              {modelOptions.length > 0 ? (
                <>
                  <select value={model} onChange={e=>setModel(e.target.value)} className={`${IC} appearance-none pr-8`}>
                    <option value="">รุ่น *</option>
                    {modelOptions.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
                </>
              ) : (
                <input value={model} onChange={e=>setModel(e.target.value)} placeholder="รุ่น *" className={IC}/>
              )}
            </div>
          </div>

          {/* IMEI */}
          <div className="relative mb-3">
            <input
              value={imei}
              onChange={e => setImei(e.target.value)}
              placeholder="IMEI"
              inputMode="numeric"
              className={`${IC} pr-20`}
            />
            <button
              onClick={() => toast.info('พิมพ์ *#06# บนมือถือ เพื่อดู IMEI')}
              className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 rounded-lg bg-[#FFC107]/20 px-2.5 py-1 text-[11px] font-bold text-[#F59E0B]"
            >
              <ScanLine className="h-3 w-3"/> สแกน
            </button>
          </div>

          {/* Serial */}
          <input value={serial} onChange={e=>setSerial(e.target.value)} placeholder="Serial Number (ถ้ามี)" className={`${IC} mb-3`}/>

          {/* Color swatches */}
          <p className="mb-2 text-[11px] font-semibold text-slate-500">สีเครื่อง</p>
          <div className="flex gap-2.5 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c.label}
                onClick={() => setColorLabel(c.label)}
                className={`flex flex-col items-center gap-1 ${colorLabel===c.label ? 'scale-110' : ''} transition-transform`}
              >
                <div
                  className={`h-9 w-9 rounded-full transition-all ${colorLabel===c.label ? 'ring-2 ring-offset-2 ring-[#FFC107]' : ''} ${c.border ? 'border border-[#E5E7EB]' : ''}`}
                  style={{ backgroundColor: c.hex }}
                />
                <span className="text-[9px] text-slate-500">{c.label}</span>
              </button>
            ))}
          </div>
        </Card>

        {/* ③ อาการเสีย */}
        <Card>
          <SectionHead num={3} title="อาการเสีย (เลือกได้หลายรายการ)"/>
          <div className="flex flex-wrap gap-2 mb-3">
            {SYMPTOMS.map(s => (
              <button
                key={s}
                onClick={() => toggleChip(symptoms, setSymptoms, s)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-all ${symptoms.includes(s) ? 'bg-[#FFF8E7] text-[#F59E0B] ring-1 ring-[#FFC107]' : 'bg-[#F8F9FB] text-slate-500'}`}
              >
                {symptoms.includes(s) && <span className="text-[10px]">✓</span>}
                {s}
              </button>
            ))}
          </div>
          <textarea
            value={issueDesc}
            onChange={e=>setIssueDesc(e.target.value)}
            rows={3}
            placeholder="รายละเอียดเพิ่มเติม เช่น ลูกค้าบอกว่า..."
            className="w-full resize-none rounded-xl border border-[#E5E7EB] bg-[#F8F9FB] p-3 text-sm text-[#111] outline-none focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
          />
        </Card>

        {/* ④ สภาพเครื่องก่อนซ่อม */}
        <Card>
          <SectionHead num={4} title="สภาพเครื่องก่อนซ่อม"/>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map(c => (
              <button
                key={c}
                onClick={() => toggleChip(conditions, setConditions, c)}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-all ${conditions.includes(c) ? 'bg-[#FEF3C7] text-[#D97706] ring-1 ring-[#FFC107]' : 'bg-[#F8F9FB] text-slate-500'}`}
              >
                {conditions.includes(c) && <span className="text-[10px]">✓</span>}
                {c}
              </button>
            ))}
          </div>
        </Card>

        {/* ⑤ รูปภาพก่อนซ่อม */}
        <Card>
          <SectionHead num={5} title="รูปภาพก่อนซ่อม"/>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((p, idx) => (
              <label key={idx} className="relative aspect-square cursor-pointer">
                {p.file ? (
                  <>
                    <img
                      src={URL.createObjectURL(p.file)}
                      className="h-full w-full rounded-xl object-cover"
                      alt=""
                    />
                    <button
                      type="button"
                      onClick={e => { e.preventDefault(); removePhoto(idx) }}
                      className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 shadow-sm"
                    >
                      <X className="h-3 w-3 text-white"/>
                    </button>
                  </>
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8F9FB] gap-1">
                    <Camera className="h-5 w-5 text-slate-300"/>
                    <span className="text-center text-[8px] leading-tight text-slate-400 px-1">{p.label}</span>
                    <input
                      type="file" accept="image/*" capture="environment"
                      className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if(f) setPhoto(idx,f); e.target.value='' }}
                    />
                  </div>
                )}
              </label>
            ))}
          </div>
        </Card>

        {/* ⑥ อุปกรณ์ที่ฝาก */}
        <Card>
          <SectionHead num={6} title="อุปกรณ์ที่ฝาก"/>
          <div className="grid grid-cols-3 gap-x-4 gap-y-3">
            {ACCESSORIES.map(a => (
              <label key={a} className="flex items-center gap-2 cursor-pointer">
                <div
                  onClick={() => toggleChip(accessories, setAccessories, a)}
                  className={`flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all ${accessories.includes(a) ? 'border-[#FFC107] bg-[#FFC107]' : 'border-[#E5E7EB] bg-white'}`}
                >
                  {accessories.includes(a) && (
                    <svg viewBox="0 0 10 8" width="10" height="8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-[12px] font-medium text-slate-600">{a}</span>
              </label>
            ))}
          </div>
        </Card>

        {/* ⑦ ประเมินราคา */}
        <Card>
          <SectionHead num={7} title="ประเมินราคา"/>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">ค่าแรง</p>
              <input value={laborCost} onChange={e=>setLaborCost(e.target.value)} type="number" inputMode="decimal" placeholder="0" className={IC}/>
            </div>
            <span className="mt-5 text-lg font-bold text-slate-300">+</span>
            <div className="flex-1">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">ค่าอะไหล่</p>
              <input value={partsCost} onChange={e=>setPartsCost(e.target.value)} type="number" inputMode="decimal" placeholder="0" className={IC}/>
            </div>
            <span className="mt-5 text-lg font-bold text-slate-300">=</span>
            <div className="flex-1">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">รวม</p>
              <div className="flex h-12 items-center rounded-xl bg-[#F0FDF4] px-4">
                <p className="text-[15px] font-extrabold text-emerald-600">{total.toLocaleString()}</p>
              </div>
            </div>
          </div>
          <p className="mt-2 text-right text-[11px] text-slate-400">บาท</p>
        </Card>

        {/* ⑧ รับมัดจำ */}
        <Card>
          <SectionHead num={8} title="รับมัดจำ"/>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <p className="mb-1.5 text-[11px] font-semibold text-slate-400">จำนวนเงิน (บาท)</p>
              <input value={deposit} onChange={e=>setDeposit(e.target.value)} type="number" inputMode="decimal" placeholder="0" className={IC}/>
            </div>
            {total > 0 && (
              <div className="flex-1">
                <p className="mb-1.5 text-[11px] font-semibold text-slate-400">คงเหลือ</p>
                <div className="flex h-12 items-center rounded-xl bg-[#F8F9FB] px-4">
                  <p className={`text-[15px] font-extrabold ${remaining > 0 ? 'text-[#111]' : 'text-emerald-600'}`}>{remaining.toLocaleString()}</p>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* ⑨ เลือกช่าง  ⑩ สถานะ */}
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <SectionHead num={9} title="เลือกช่าง"/>
              <div className="relative">
                <select
                  value={techId}
                  onClick={loadTechs}
                  onChange={e => {
                    setTechId(e.target.value)
                    const found = technicians.find(t=>t.id===e.target.value)
                    setTechName(found?.name ?? '')
                  }}
                  className={`${IC} appearance-none pr-8 text-[13px]`}
                >
                  <option value="">-- เลือกช่าง --</option>
                  {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
              </div>
            </div>
            <div>
              <SectionHead num={10} title="สถานะเริ่มต้น"/>
              <div className="relative">
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value)}
                  className={`${IC} appearance-none pr-8 text-[13px]`}
                >
                  {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
              </div>
            </div>
          </div>
        </Card>

      </div>

      {/* ── Sticky bottom bar ── */}
      <div className="fixed bottom-0 left-0 right-0 flex gap-3 bg-[#F8F9FB] px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#FFC107] text-[16px] font-bold text-[#111] shadow-[0_4px_20px_rgba(255,193,7,0.45)] disabled:opacity-60 active:scale-[0.98] transition-transform"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin"/> : 'บันทึกงานซ่อม'}
        </button>
        <button className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#111] active:scale-95 transition-transform">
          <Mic className="h-6 w-6 text-white"/>
        </button>
      </div>
    </div>
  )
}
