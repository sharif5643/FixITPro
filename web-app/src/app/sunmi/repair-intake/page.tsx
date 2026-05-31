'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { format, addDays } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  User, Search, X, CheckCircle2, ChevronRight, ChevronLeft,
  Wrench, Calendar, Banknote, Camera, Images,
} from 'lucide-react'

type PhotoItem = { file: File; preview: string }
import { SunmiShell } from '@/components/sunmi/sunmi-shell'
import { PrinterFlowSheet } from '@/components/sunmi/printer-flow'
import { useAuthStore } from '@/store/auth.store'
import {
  buildRepairIntakeHtml, buildRepairIntakePreviewData, shareRepairIntake,
  type PrintRepairIntakeOptions,
} from '@/lib/printer'
import api from '@/lib/api'
import { offlineQueue } from '@/lib/offline-queue'
import { useNetworkStatus } from '@/hooks/use-network-status'
import type { Customer, ShopSettings, User as UserType, Repair } from '@/types'

// ── Constants ─────────────────────────────────────────────────────────────────

const DEVICE_BRANDS = ['Samsung', 'Apple', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'Huawei', 'Nokia']

// Quick model templates per brand (tap to fill both brand + model instantly)
const QUICK_MODELS: Record<string, string[]> = {
  Apple:   ['iPhone 11', 'iPhone 12', 'iPhone 13', 'iPhone 14', 'iPhone 15', 'iPhone 15 Pro', 'iPhone 16'],
  Samsung: ['Galaxy A15', 'Galaxy A35', 'Galaxy A55', 'Galaxy S23', 'Galaxy S24', 'Galaxy S24 Ultra'],
  Xiaomi:  ['Redmi 13', 'Redmi Note 12', 'Redmi Note 13', 'POCO X6', 'Xiaomi 14'],
  OPPO:    ['OPPO A60', 'OPPO A3', 'Reno11', 'Reno12', 'Find X7'],
  Vivo:    ['Vivo Y28', 'Vivo Y38', 'Vivo V30', 'Vivo V40'],
  Realme:  ['Realme C63', 'Realme 12', 'Realme 12 Pro', 'Realme GT6'],
  Huawei:  ['Nova 12', 'Y90', 'Mate 60'],
  Nokia:   ['Nokia G42', 'Nokia C32', 'Nokia XR21'],
}

const CONDITION_ITEMS = [
  'หน้าจอแตก',
  'เคสแตก / บิ่น',
  'ปุ่มหัก / ค้าง',
  'ชาร์จไม่ติด',
  'น้ำเข้า',
  'ลำโพงเสีย',
  'กล้องหัก / ขุ่น',
  'ไมค์เสีย',
  'Wi-Fi / สัญญาณหาย',
  'แบตเตอรี่บวม',
]

const ACCESSORY_ITEMS = [
  'ฝาหลัง / เคส',
  'ซิมการ์ด',
  'บัตรความจำ',
  'ที่ชาร์จ',
  'หูฟัง / หัวแปลง',
  'สายเคเบิล',
  'กระจกกันรอย',
  'กล่อง / เอกสาร',
]

// ── Form schema ───────────────────────────────────────────────────────────────

const schema = z.object({
  // Step 0 — Customer
  customerId:    z.string().optional(),
  customerName:  z.string().min(1, 'กรุณากรอกชื่อลูกค้า'),
  customerPhone: z.string().optional(),

  // Step 1 — Device
  deviceBrand:   z.string().min(1, 'กรุณากรอกยี่ห้อ'),
  deviceModel:   z.string().min(1, 'กรุณากรอกรุ่น'),
  deviceColor:   z.string().optional(),
  deviceImei:    z.string().optional(),
  technicianId:  z.string().optional(),

  // Step 2 — Issue + Condition
  issue:          z.string().min(1, 'กรุณากรอกอาการเสีย'),
  conditionIssues: z.array(z.string()).default([]),

  // Step 3 — Accessories + Details
  accessories:   z.array(z.string()).default([]),
  deposit:       z.coerce.number().min(0).default(0),
  estimateCost:  z.coerce.number().min(0).optional(),
  dueDate:       z.string().optional(),
  note:          z.string().optional(),
})
type FormData = z.infer<typeof schema>

// ── UI primitives ─────────────────────────────────────────────────────────────

const INPUT    = 'w-full h-12 px-4 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500'
const TEXTAREA = 'w-full px-4 py-3 border border-slate-200 rounded-xl text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none'

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-slate-600">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{children}</p>
}

function Divider() {
  return <div className="border-t border-dashed border-slate-200" />
}

// ── Step bar ─────────────────────────────────────────────────────────────────

const STEP_LABELS = ['ลูกค้า', 'อุปกรณ์', 'อาการ', 'รายละเอียด', 'ยืนยัน']

function StepBar({ current }: { current: number }) {
  return (
    <div className="bg-white border-b border-slate-100 px-4 py-2 shrink-0">
      <div className="flex gap-1.5 mb-1.5">
        {STEP_LABELS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-all ${
              i < current ? 'bg-blue-600' : i === current ? 'bg-blue-400' : 'bg-slate-200'
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-slate-400 text-center">
        ขั้นตอน {current + 1} / {STEP_LABELS.length} — <span className="font-semibold text-slate-600">{STEP_LABELS[current]}</span>
      </p>
    </div>
  )
}

// ── Step 0: Customer ──────────────────────────────────────────────────────────

function StepCustomer({ register, errors, setValue, watch }: { register: any; errors: any; setValue: any; watch: any }) {
  const [searchQ, setSearchQ]     = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults]     = useState<Customer[]>([])
  const [selected, setSelected]   = useState<Customer | null>(null)
  const searchTimer                = useRef<ReturnType<typeof setTimeout>>()

  async function doSearch(q: string) {
    const trimmed = q.trim()
    if (!trimmed) { setResults([]); return }
    setSearching(true)
    try {
      const res = await api.get('/customers', { params: { search: trimmed, limit: 10 } })
      setResults(Array.isArray(res.data) ? res.data : (res.data?.items ?? []))
    } catch {
      toast.error('ค้นหาลูกค้าไม่สำเร็จ')
    } finally {
      setSearching(false)
    }
  }

  // Auto-search after 400ms of typing (phone numbers trigger at 3+ digits)
  useEffect(() => {
    clearTimeout(searchTimer.current)
    if (searchQ.trim().length >= 3) {
      searchTimer.current = setTimeout(() => doSearch(searchQ), 400)
    } else {
      setResults([])
    }
    return () => clearTimeout(searchTimer.current)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQ])

  function pick(c: Customer) {
    setSelected(c)
    setResults([])
    setSearchQ('')
    setValue('customerId', c.id)
    setValue('customerName', c.name)
    setValue('customerPhone', c.phone ?? '')
  }

  function clear() {
    setSelected(null)
    setValue('customerId', '')
    setValue('customerName', '')
    setValue('customerPhone', '')
  }

  return (
    <div className="space-y-5">
      <SectionTitle>ขั้นตอนที่ 1 — ข้อมูลลูกค้า</SectionTitle>

      {selected ? (
        <div className="flex items-center gap-3 bg-blue-50 border-2 border-blue-200 rounded-2xl p-4">
          <div className="h-10 w-10 rounded-xl bg-blue-600 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-blue-900 truncate">{selected.name}</p>
            {selected.phone && <p className="text-sm text-blue-600">{selected.phone}</p>}
          </div>
          <button type="button" onClick={clear} className="text-slate-400 p-1 active:text-red-500">
            <X className="h-5 w-5" />
          </button>
        </div>
      ) : (
        <>
          {/* Quick phone search — auto-searches as you type */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { doSearch(searchQ); e.preventDefault() } }}
                placeholder="พิมพ์เบอร์โทร หรือชื่อลูกค้า (3+ ตัวอักษร)..."
                type="tel"
                inputMode="tel"
                autoFocus
                className="w-full h-14 pl-9 pr-9 border-2 border-slate-200 rounded-2xl bg-white text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {searching && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              )}
              {!searching && searchQ && (
                <button
                  type="button"
                  onClick={() => { setSearchQ(''); setResults([]) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <p className="text-xs text-slate-400 px-1">ค้นหาอัตโนมัติเมื่อพิมพ์ 3 ตัวขึ้นไป</p>

            {results.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden shadow-sm">
                {results.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-blue-50"
                  >
                    <div className="h-9 w-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900 truncate">{c.name}</p>
                      {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {searchQ.trim().length >= 3 && !searching && results.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-2">ไม่พบลูกค้า — กรอกข้อมูลด้านล่างได้เลย</p>
            )}
          </div>

          <Divider />

          {/* Manual entry */}
          <div className="space-y-4">
            <p className="text-sm text-slate-400 font-medium">กรอกข้อมูลลูกค้าใหม่</p>
            <Field label="ชื่อลูกค้า *" error={errors.customerName?.message}>
              <input {...register('customerName')} placeholder="ชื่อ-นามสกุล" className={INPUT} />
            </Field>
            <Field label="เบอร์โทร">
              <input
                {...register('customerPhone')}
                placeholder="0812345678"
                type="tel"
                inputMode="tel"
                className={INPUT}
                onFocus={(e) => {
                  // Pre-fill from search if it looks like a phone number
                  if (!e.target.value && /^\d{3,}/.test(searchQ)) {
                    setValue('customerPhone', searchQ)
                  }
                }}
              />
            </Field>
          </div>
        </>
      )}
    </div>
  )
}

// ── Step 1: Device ────────────────────────────────────────────────────────────

function StepDevice({
  register, errors, setValue, watch, technicians,
}: {
  register: any; errors: any; setValue: any; watch: any
  technicians: UserType[]
}) {
  const brand        = watch('deviceBrand') as string
  const technicianId = watch('technicianId') as string

  const brandInList = DEVICE_BRANDS.includes(brand)

  function pickBrand(b: string) {
    setValue('deviceBrand', b, { shouldValidate: true })
  }

  return (
    <div className="space-y-5">
      <SectionTitle>ขั้นตอนที่ 2 — ข้อมูลอุปกรณ์</SectionTitle>

      {/* Brand chips */}
      <Field label="ยี่ห้อ *" error={errors.deviceBrand?.message}>
        <div className="flex flex-wrap gap-2 mb-2">
          {DEVICE_BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => pickBrand(b)}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${
                brand === b
                  ? 'border-blue-600 bg-blue-600 text-white'
                  : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
              }`}
            >
              {b}
            </button>
          ))}
        </div>
        <input
          {...register('deviceBrand')}
          placeholder="หรือพิมพ์ยี่ห้ออื่น..."
          className={`${INPUT} ${brandInList ? 'bg-slate-50 text-slate-400' : ''}`}
          onFocus={() => { if (brandInList) setValue('deviceBrand', '', { shouldValidate: false }) }}
        />
      </Field>

      {/* Quick model chips — shown when a known brand is selected */}
      {brand && QUICK_MODELS[brand] && (
        <div className="space-y-2 -mt-2">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">รุ่นยอดนิยม — แตะเพื่อเลือก</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_MODELS[brand].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setValue('deviceModel', m, { shouldValidate: true })}
                className={`px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-colors ${
                  watch('deviceModel') === m
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="รุ่น *" error={errors.deviceModel?.message}>
        <input {...register('deviceModel')} placeholder="เช่น Galaxy S24 / iPhone 15 Pro" className={INPUT} />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="สี">
          <input {...register('deviceColor')} placeholder="ดำ / ขาว / ทอง" className={INPUT} />
        </Field>
        <Field label="IMEI / Serial">
          <input {...register('deviceImei')} placeholder="15 หลัก" inputMode="numeric" className={INPUT} />
        </Field>
      </div>

      {/* Technician assignment — only shown if users loaded */}
      {technicians.length > 0 && (
        <>
          <Divider />
          <Field label="มอบหมายช่าง (ไม่บังคับ)">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValue('technicianId', '')}
                className={`h-11 rounded-xl border-2 text-sm font-medium transition-colors ${
                  !technicianId
                    ? 'border-slate-600 bg-slate-800 text-white'
                    : 'border-slate-200 bg-white text-slate-500 active:bg-slate-50'
                }`}
              >
                ยังไม่ระบุ
              </button>
              {technicians.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setValue('technicianId', t.id)}
                  className={`h-11 rounded-xl border-2 text-sm font-medium transition-colors truncate px-3 ${
                    technicianId === t.id
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 active:bg-slate-50'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          </Field>
        </>
      )}
    </div>
  )
}

// ── Step 2: Issue + Device Condition ─────────────────────────────────────────

function StepIssue({ register, errors, watch, setValue }: { register: any; errors: any; watch: any; setValue: any }) {
  const conditionIssues: string[] = watch('conditionIssues') ?? []

  function toggle(item: string) {
    if (conditionIssues.includes(item)) {
      setValue('conditionIssues', conditionIssues.filter((x) => x !== item))
    } else {
      setValue('conditionIssues', [...conditionIssues, item])
    }
  }

  return (
    <div className="space-y-5">
      <SectionTitle>ขั้นตอนที่ 3 — อาการเสีย</SectionTitle>

      <Field label="อาการเสียที่ลูกค้าแจ้ง *" error={errors.issue?.message}>
        <textarea
          {...register('issue')}
          rows={4}
          placeholder="อธิบายอาการเสียที่ลูกค้าแจ้งมา..."
          className={TEXTAREA}
        />
      </Field>

      <Divider />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-600">สภาพที่มีปัญหา (เลือกทั้งหมดที่พบ)</label>
          {conditionIssues.length > 0 && (
            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
              {conditionIssues.length} รายการ
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CONDITION_ITEMS.map((item) => {
            const checked = conditionIssues.includes(item)
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggle(item)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                  checked
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                {checked && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span className="leading-tight">{item}</span>
              </button>
            )
          })}
        </div>
        {conditionIssues.length === 0 && (
          <p className="text-xs text-slate-400 text-center">ไม่มีรายการ = อุปกรณ์อยู่ในสภาพปกติก่อนซ่อม</p>
        )}
      </div>
    </div>
  )
}

// ── Step 3: Accessories + Details ─────────────────────────────────────────────

function StepDetails({
  register, errors, watch, setValue, defaultDeposit,
  photos, onAddPhoto, onRemovePhoto,
}: {
  register: any; errors: any; watch: any; setValue: any; defaultDeposit: number
  photos: PhotoItem[]
  onAddPhoto: (files: FileList) => void
  onRemovePhoto: (idx: number) => void
}) {
  const accessories: string[] = watch('accessories') ?? []

  function toggleAcc(item: string) {
    if (accessories.includes(item)) {
      setValue('accessories', accessories.filter((x) => x !== item))
    } else {
      setValue('accessories', [...accessories, item])
    }
  }

  // Default due date = today + 3 days
  const defaultDueDate = format(addDays(new Date(), 3), 'yyyy-MM-dd')

  return (
    <div className="space-y-5">
      <SectionTitle>ขั้นตอนที่ 4 — อุปกรณ์ที่รับมา & ค่าใช้จ่าย</SectionTitle>

      {/* Accessories checklist */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-slate-600">อุปกรณ์ที่ลูกค้าฝากมา</label>
          {accessories.length > 0 && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">
              {accessories.length} รายการ
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ACCESSORY_ITEMS.map((item) => {
            const checked = accessories.includes(item)
            return (
              <button
                key={item}
                type="button"
                onClick={() => toggleAcc(item)}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                  checked
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 active:bg-slate-50'
                }`}
              >
                {checked && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                <span className="leading-tight">{item}</span>
              </button>
            )
          })}
        </div>
      </div>

      <Divider />

      {/* Cost */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="มัดจำ (บาท)">
          <input
            {...register('deposit')}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder={String(defaultDeposit || 0)}
            className="w-full h-14 px-4 border border-slate-200 rounded-xl text-2xl font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>
        <Field label="ประมาณการ (บาท)">
          <input
            {...register('estimateCost')}
            type="number"
            min="0"
            inputMode="numeric"
            placeholder="ยังไม่ทราบ"
            className="w-full h-14 px-4 border border-slate-200 rounded-xl text-2xl font-bold bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </Field>
      </div>

      {/* Due date */}
      <Field label="กำหนดวันเสร็จ">
        <div className="relative">
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            {...register('dueDate')}
            type="date"
            defaultValue={defaultDueDate}
            min={format(new Date(), 'yyyy-MM-dd')}
            className={`${INPUT} pl-9`}
          />
        </div>
      </Field>

      {/* Technician note */}
      <Field label="หมายเหตุช่าง">
        <textarea
          {...register('note')}
          rows={2}
          placeholder="โน้ตสำหรับช่างซ่อม..."
          className={TEXTAREA}
        />
      </Field>

      <Divider />

      {/* Device photos */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionTitle>รูปถ่ายอุปกรณ์</SectionTitle>
          <span className="text-xs text-slate-400 font-medium">{photos.length}/6 รูป</span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {['หน้าจอ', 'ด้านหลัง', 'จุดเสียหาย', 'สติ๊กเกอร์ IMEI', 'อุปกรณ์เสริม'].map((hint) => (
            <span key={hint} className="text-xs bg-slate-100 text-slate-500 px-2 py-1 rounded-full">
              {hint}
            </span>
          ))}
        </div>

        {photos.length < 6 && (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50 text-blue-600 active:bg-blue-100 cursor-pointer select-none">
              <Camera className="h-7 w-7" />
              <span className="text-sm font-bold">ถ่ายรูป</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                capture="environment"
                multiple
                onChange={(e) => { if (e.target.files) onAddPhoto(e.target.files); e.target.value = '' }}
              />
            </label>
            <label className="flex flex-col items-center justify-center gap-2 h-24 rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 text-slate-600 active:bg-slate-100 cursor-pointer select-none">
              <Images className="h-7 w-7" />
              <span className="text-sm font-bold">เลือกรูป</span>
              <input
                type="file"
                className="hidden"
                accept="image/*"
                multiple
                onChange={(e) => { if (e.target.files) onAddPhoto(e.target.files); e.target.value = '' }}
              />
            </label>
          </div>
        )}

        {photos.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative aspect-square">
                <img
                  src={p.preview}
                  alt={`photo ${i + 1}`}
                  className="w-full h-full object-cover rounded-xl"
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(i)}
                  className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/60 text-white flex items-center justify-center active:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Confirmation ──────────────────────────────────────────────────────

function StepConfirm({ watch, technicians, photoCount }: { watch: any; technicians: UserType[]; photoCount: number }) {
  const data = watch() as FormData
  const techName = technicians.find((t) => t.id === data.technicianId)?.name

  function Row({ label, value, bold }: { label: string; value?: string | number | null; bold?: boolean }) {
    if (!value && value !== 0) return null
    return (
      <div className="flex gap-3 py-1.5">
        <span className="text-slate-400 text-sm w-24 shrink-0">{label}</span>
        <span className={`text-slate-800 text-sm flex-1 ${bold ? 'font-bold' : ''}`}>{value}</span>
      </div>
    )
  }

  function Section({ children }: { children: React.ReactNode }) {
    return <div className="bg-white rounded-2xl p-4 space-y-0.5 divide-y divide-slate-50">{children}</div>
  }

  const dueDateFormatted = data.dueDate
    ? format(new Date(data.dueDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: th })
    : undefined

  return (
    <div className="space-y-4">
      <SectionTitle>ขั้นตอนที่ 5 — ตรวจสอบก่อนบันทึก</SectionTitle>

      {/* Customer */}
      <Section>
        <Row label="ลูกค้า"   value={data.customerName} bold />
        <Row label="โทร"     value={data.customerPhone} />
      </Section>

      {/* Device */}
      <Section>
        <Row label="อุปกรณ์" value={`${data.deviceBrand} ${data.deviceModel}`} bold />
        <Row label="สี"      value={data.deviceColor} />
        <Row label="IMEI"    value={data.deviceImei} />
        {techName && <Row label="ช่าง" value={techName} />}
      </Section>

      {/* Issue + Condition */}
      <Section>
        <Row label="อาการ" value={data.issue} />
        {data.conditionIssues.length > 0 && (
          <Row label="สภาพ" value={data.conditionIssues.join(', ')} />
        )}
      </Section>

      {/* Accessories + Details */}
      <Section>
        {data.accessories.length > 0 && (
          <Row label="อุปกรณ์" value={data.accessories.join(', ')} />
        )}
        <Row label="มัดจำ"     value={`฿${(data.deposit || 0).toLocaleString('th-TH')}`} bold />
        {data.estimateCost ? (
          <Row label="ประมาณการ" value={`฿${Number(data.estimateCost).toLocaleString('th-TH')}`} />
        ) : null}
        <Row label="กำหนดเสร็จ" value={dueDateFormatted} />
        <Row label="หมายเหตุ"   value={data.note} />
      </Section>

      {photoCount > 0 && (
        <Section>
          <Row label="รูปถ่าย" value={`${photoCount} รูป`} />
        </Section>
      )}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

const TOTAL_STEPS = 5

export default function RepairIntakePage() {
  const router  = useRouter()
  const user    = useAuthStore((s) => s.user)
  const [step, setStep]       = useState(0)
  const [preview, setPreview] = useState<PrintRepairIntakeOptions | null>(null)
  const [photos, setPhotos]   = useState<PhotoItem[]>([])

  function handleAddPhoto(files: FileList) {
    const remaining = Math.max(0, 6 - photos.length)
    const toAdd = Array.from(files).slice(0, remaining)
    Promise.all(
      toAdd.map(
        (file) =>
          new Promise<PhotoItem>((resolve) => {
            const reader = new FileReader()
            reader.onload = (e) => resolve({ file, preview: e.target!.result as string })
            reader.readAsDataURL(file)
          }),
      ),
    ).then((items) => setPhotos((prev) => [...prev, ...items]))
  }

  function handleRemovePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  const { data: settings } = useQuery<ShopSettings>({
    queryKey:  ['settings'],
    queryFn:   async () => (await api.get('/settings')).data,
    staleTime: 60_000,
  })

  // Fetch users for technician assignment — silently skip if no permission
  const { data: allUsers = [] } = useQuery<UserType[]>({
    queryKey:  ['users'],
    queryFn:   async () => {
      try { return (await api.get('/users')).data }
      catch { return [] }
    },
    staleTime: 60_000,
  })

  const technicians = useMemo(
    () => allUsers.filter((u) => u.role === 'TECHNICIAN' || u.role === 'MANAGER' || u.role === 'OWNER'),
    [allUsers],
  )

  const { online } = useNetworkStatus()

  const { register, handleSubmit, watch, setValue, trigger, reset, formState: { errors } } =
    useForm<FormData>({
      resolver:      zodResolver(schema),
      defaultValues: {
        deposit:         Number(settings?.defaultDeposit ?? 0),
        checklist:       [],
        conditionIssues: [],
        accessories:     [],
      } as any,
    })

  // Sync default deposit when settings load
  const defaultDeposit = Number(settings?.defaultDeposit ?? 0)

  async function goNext() {
    let fields: (keyof FormData)[] = []
    if (step === 0) fields = ['customerName']
    if (step === 1) fields = ['deviceBrand', 'deviceModel']
    if (step === 2) fields = ['issue']
    const ok = await trigger(fields)
    if (ok) setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      const condNote = data.conditionIssues.length > 0
        ? `สภาพ: ${data.conditionIssues.join(', ')}${data.note ? '\n---\n' + data.note : ''}`
        : data.note

      const payload = {
        customerId:    data.customerId || undefined,
        customerName:  data.customerName.trim(),
        customerPhone: data.customerPhone?.trim() || undefined,
        technicianId:  data.technicianId || undefined,
        deviceBrand:   data.deviceBrand.trim(),
        deviceModel:   data.deviceModel.trim(),
        deviceColor:   data.deviceColor?.trim() || undefined,
        deviceImei:    data.deviceImei?.trim() || undefined,
        issue:         data.issue.trim(),
        accessories:   data.accessories.length > 0 ? JSON.stringify(data.accessories) : undefined,
        dueDate:       data.dueDate ? new Date(data.dueDate + 'T12:00:00').toISOString() : undefined,
        estimateCost:  data.estimateCost || undefined,
        deposit:       data.deposit ?? 0,
        note:          condNote?.trim() || undefined,
      }

      if (!online) {
        await offlineQueue.enqueue('REPAIR_CREATE', payload)
        return { _queued: true as const }
      }

      return api.post('/repairs', payload)
    },

    onSuccess: async (res: any, variables) => {
      if (res?._queued) {
        toast.success('บันทึกในเครื่องแล้ว จะซิงค์อัตโนมัติเมื่อเชื่อมต่ออินเทอร์เน็ต')
        setPhotos([])
        reset({ deposit: defaultDeposit, conditionIssues: [], accessories: [] } as any)
        setStep(0)
        return
      }
      const repair    = res.data as Repair
      const techName  = technicians.find((t) => t.id === variables.technicianId)?.name ?? user?.name

      // Upload photos (non-blocking — repair is saved regardless)
      if (photos.length > 0) {
        const fd = new FormData()
        photos.forEach((p) => fd.append('files', p.file))
        try {
          await api.post(`/repairs/${repair.id}/images`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          })
        } catch {
          toast.error('บันทึกรูปถ่ายไม่สำเร็จ — งานซ่อมถูกบันทึกแล้ว')
        }
      }

      const dueDateFormatted = variables.dueDate
        ? format(new Date(variables.dueDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: th })
        : undefined

      const opts: PrintRepairIntakeOptions = {
        shopName:       settings?.shopName ?? 'FixITPro',
        shopPhone:      settings?.shopPhone ?? undefined,
        ticketNumber:   repair.ticketNumber,
        date:           format(new Date(repair.receivedAt), 'dd/MM/yyyy HH:mm', { locale: th }),
        customerName:   repair.customer?.name ?? variables.customerName,
        customerPhone:  repair.customer?.phone ?? variables.customerPhone,
        deviceBrand:    repair.deviceBrand,
        deviceModel:    repair.deviceModel,
        deviceColor:    variables.deviceColor || undefined,
        deviceImei:     repair.deviceImei,
        issue:          repair.issue,
        conditionIssues: variables.conditionIssues.length > 0 ? variables.conditionIssues : undefined,
        accessories:    variables.accessories.length > 0 ? variables.accessories : undefined,
        deposit:        repair.deposit,
        estimateCost:   variables.estimateCost || undefined,
        dueDate:        dueDateFormatted,
        technicianName: techName,
        footer:         settings?.receiptFooter ?? 'ขอบคุณที่ใช้บริการ',
        taxId:          settings?.taxId ?? undefined,
        showTaxId:      settings?.showTaxId ?? true,
        showLogo:       settings?.showLogo ?? true,
        logoUrl:        settings?.logoUrl ?? undefined,
      }

      toast.success(`รับงาน ${repair.ticketNumber} สำเร็จ`)
      setPhotos([])
      reset({ deposit: defaultDeposit, conditionIssues: [], accessories: [] } as any)
      setStep(0)
      setPreview(opts)
    },

    onError: (err: any) => {
      const msg = err.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'เกิดข้อผิดพลาด'))
    },
  })

  const isLastStep = step === TOTAL_STEPS - 1

  return (
    <>
      <SunmiShell
        title={`รับงานซ่อม — ${STEP_LABELS[step]}`}
        aboveScroll={<StepBar current={step} />}
        belowScroll={
          <div className="bg-white border-t border-slate-100 px-4 py-3 flex gap-3 shrink-0">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="h-14 px-5 rounded-2xl border-2 border-slate-200 text-slate-600 font-bold active:bg-slate-50 flex items-center gap-1"
              >
                <ChevronLeft className="h-5 w-5" />
                ย้อน
              </button>
            )}

            {!isLastStep ? (
              <button
                type="button"
                onClick={goNext}
                className="flex-1 h-14 rounded-2xl bg-blue-600 text-white font-bold text-lg active:bg-blue-700 flex items-center justify-center gap-2"
              >
                ถัดไป
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit((d) => mutation.mutate(d))}
                disabled={mutation.isPending}
                className="flex-1 h-14 rounded-2xl bg-green-600 text-white font-bold text-lg active:bg-green-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {mutation.isPending
                  ? <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-white border-t-transparent" />
                  : <><Wrench className="h-6 w-6" />ยืนยันรับงาน</>}
              </button>
            )}
          </div>
        }
      >
        <div className="p-4 space-y-4 pb-4">
          {step === 0 && (
            <StepCustomer register={register} errors={errors} setValue={setValue} watch={watch} />
          )}
          {step === 1 && (
            <StepDevice
              register={register} errors={errors} setValue={setValue} watch={watch}
              technicians={technicians}
            />
          )}
          {step === 2 && (
            <StepIssue register={register} errors={errors} watch={watch} setValue={setValue} />
          )}
          {step === 3 && (
            <StepDetails
              register={register} errors={errors} watch={watch} setValue={setValue}
              defaultDeposit={defaultDeposit}
              photos={photos}
              onAddPhoto={handleAddPhoto}
              onRemovePhoto={handleRemovePhoto}
            />
          )}
          {step === 4 && (
            <StepConfirm watch={watch} technicians={technicians} photoCount={photos.length} />
          )}
        </div>
      </SunmiShell>

      {preview && (
        <PrinterFlowSheet
          receiptHtml={buildRepairIntakeHtml(preview)}
          jobName={`ใบรับซ่อม #${preview.ticketNumber}`}
          previewData={buildRepairIntakePreviewData(preview)}
          onShare={async () => shareRepairIntake(preview)}
          onClose={() => setPreview(null)}
          successNavItems={[
            { label: 'ดูรายการซ่อมทั้งหมด', href: '/sunmi/repairs' },
            { label: 'รับงานใหม่',           href: '/sunmi/repair-intake' },
            { label: 'กลับหน้าหลัก',         href: '/sunmi' },
          ]}
        />
      )}
    </>
  )
}
