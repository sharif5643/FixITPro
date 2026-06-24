'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, Camera, Loader2, X, User, Smartphone, Wrench, Printer } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

const schema = z.object({
  customerName:     z.string().min(1, 'กรุณากรอกชื่อลูกค้า'),
  customerPhone:    z.string().min(9, 'เบอร์โทรไม่ถูกต้อง'),
  customerLineId:   z.string().optional(),
  deviceBrand:      z.string().min(1, 'กรุณาเลือกยี่ห้อ'),
  deviceModel:      z.string().min(1, 'กรุณากรอกรุ่น'),
  deviceImei:       z.string().optional(),
  deviceSerial:     z.string().optional(),
  deviceColor:      z.string().optional(),
  devicePasscode:   z.string().optional(),
  issueTitle:       z.string().min(1, 'กรุณาระบุอาการ'),
  issueDescription: z.string().optional(),
  estimatedCost:    z.string().optional(),
})
type Form = z.infer<typeof schema>

const BRANDS = ['Apple', 'Samsung', 'OPPO', 'Xiaomi', 'Vivo', 'Huawei', 'Nokia', 'Sony', 'อื่นๆ']
const ISSUE_TYPES = ['หน้าจอแตก', 'แบตเสีย', 'ชาร์จไม่เข้า', 'กล้องเสีย', 'ลำโพงเสีย', 'ซอฟต์แวร์', 'น้ำเข้า', 'อื่นๆ']

export default function CreateRepairPage() {
  const router  = useRouter()
  const [photos,  setPhotos]  = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [section, setSection] = useState<'customer' | 'device' | 'repair'>('customer')

  const { register, handleSubmit, formState: { errors }, setValue, watch } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const selectedBrand = watch('deviceBrand')

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPhotos((prev) => [...prev, ...files].slice(0, 4))
    e.target.value = ''
  }

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const form = new FormData()
      Object.entries(data).forEach(([k, v]) => v && form.append(k, v))
      if (data.estimatedCost) form.set('estimatedCost', String(parseFloat(data.estimatedCost)))
      photos.forEach((f) => form.append('photos', f))

      const res = await api.post('/repairs', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      toast.success('สร้างงานซ่อมสำเร็จ')
      router.replace(`/staff/repairs/${res.data.id}`)
    } catch {
      toast.error('สร้างงานซ่อมไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  const SECTIONS = [
    { key: 'customer', label: 'ลูกค้า',  icon: <User       className="h-4 w-4" /> },
    { key: 'device',   label: 'อุปกรณ์', icon: <Smartphone className="h-4 w-4" /> },
    { key: 'repair',   label: 'ซ่อม',    icon: <Wrench     className="h-4 w-4" /> },
  ]

  return (
    <div className="flex min-h-screen flex-col bg-brand-light pb-24">
      {/* Header */}
      <div className="bg-white px-5 pb-4 pt-14 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-light">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="text-lg font-bold text-brand-black">รับงานซ่อมใหม่</h1>
        </div>

        {/* Section tabs */}
        <div className="flex gap-2">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key as any)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-colors ${
                section === s.key ? 'bg-brand-yellow text-brand-black' : 'bg-brand-light text-slate-500'
              }`}
            >
              {s.icon}{s.label}
            </button>
          ))}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-5 flex flex-col gap-4">
        {/* Customer section */}
        {section === 'customer' && (
          <FormCard title="ข้อมูลลูกค้า" icon={<User className="h-4 w-4 text-brand-info" />}>
            <Field label="ชื่อ - นามสกุล *" error={errors.customerName?.message}>
              <input {...register('customerName')} placeholder="สมชาย ใจดี" className={INPUT_CLS} />
            </Field>
            <Field label="เบอร์โทรศัพท์ *" error={errors.customerPhone?.message}>
              <input {...register('customerPhone')} type="tel" placeholder="088-123-4567" className={INPUT_CLS} />
            </Field>
            <Field label="LINE ID">
              <input {...register('customerLineId')} placeholder="somchai_jai" className={INPUT_CLS} />
            </Field>
          </FormCard>
        )}

        {/* Device section */}
        {section === 'device' && (
          <FormCard title="ข้อมูลอุปกรณ์" icon={<Smartphone className="h-4 w-4 text-brand-yellow" />}>
            <Field label="ยี่ห้อ *" error={errors.deviceBrand?.message}>
              <div className="flex flex-wrap gap-2">
                {BRANDS.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setValue('deviceBrand', b, { shouldValidate: true })}
                    className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                      selectedBrand === b ? 'bg-brand-yellow text-brand-black' : 'bg-brand-light text-slate-500'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="รุ่น *" error={errors.deviceModel?.message}>
              <input {...register('deviceModel')} placeholder="iPhone 15 Pro" className={INPUT_CLS} />
            </Field>
            <Field label="IMEI">
              <input {...register('deviceImei')} placeholder="352040110393847" inputMode="numeric" className={INPUT_CLS} />
            </Field>
            <Field label="หมายเลข S/N">
              <input {...register('deviceSerial')} className={INPUT_CLS} />
            </Field>
            <Field label="สี">
              <input {...register('deviceColor')} placeholder="Natural Titanium" className={INPUT_CLS} />
            </Field>
            <Field label="รหัสผ่าน / ลายนิ้วมือ">
              <input {...register('devicePasscode')} placeholder="1234" className={INPUT_CLS} />
            </Field>
          </FormCard>
        )}

        {/* Repair section */}
        {section === 'repair' && (
          <>
            <FormCard title="รายละเอียดซ่อม" icon={<Wrench className="h-4 w-4 text-brand-success" />}>
              <Field label="ประเภทปัญหา *" error={errors.issueTitle?.message}>
                <div className="flex flex-wrap gap-2">
                  {ISSUE_TYPES.map((t) => {
                    const v = watch('issueTitle')
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setValue('issueTitle', t, { shouldValidate: true })}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                          v === t ? 'bg-brand-yellow text-brand-black' : 'bg-brand-light text-slate-500'
                        }`}
                      >
                        {t}
                      </button>
                    )
                  })}
                </div>
              </Field>
              <Field label="รายละเอียด">
                <textarea
                  {...register('issueDescription')}
                  rows={3}
                  placeholder="อธิบายอาการเพิ่มเติม..."
                  className={INPUT_CLS + ' h-auto resize-none py-3'}
                />
              </Field>
              <Field label="ราคาประเมิน (บาท)">
                <input
                  {...register('estimatedCost')}
                  type="number"
                  placeholder="500"
                  inputMode="decimal"
                  className={INPUT_CLS}
                />
              </Field>
            </FormCard>

            {/* Photos */}
            <FormCard title="รูปภาพอุปกรณ์" icon={<Camera className="h-4 w-4 text-purple-500" />}>
              <div className="grid grid-cols-4 gap-2">
                {photos.map((f, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-brand-light">
                    <img src={URL.createObjectURL(f)} className="h-full w-full object-cover" alt="" />
                    <button
                      type="button"
                      onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/50"
                    >
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ))}
                {photos.length < 4 && (
                  <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-brand-light">
                    <Camera className="h-5 w-5 text-slate-300" />
                    <span className="text-[9px] text-slate-400">ถ่ายรูป</span>
                    <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={addPhoto} />
                  </label>
                )}
                {['หน้า', 'หลัง', 'ความเสียหาย', 'อุปกรณ์เสริม'].slice(photos.length + 1).map((l) => (
                  <div key={l} className="flex aspect-square flex-col items-center justify-center rounded-xl bg-brand-light">
                    <Camera className="h-5 w-5 text-slate-200" />
                    <p className="text-[9px] text-slate-300">{l}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400">รูปภาพสูงสุด 4 ใบ</p>
            </FormCard>
          </>
        )}

        {/* Bottom buttons */}
        <div className="flex gap-3">
          {section !== 'customer' && (
            <button
              type="button"
              onClick={() => setSection(section === 'repair' ? 'device' : 'customer')}
              className="flex h-[52px] flex-1 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600"
            >
              ย้อนกลับ
            </button>
          )}
          {section !== 'repair' ? (
            <button
              type="button"
              onClick={() => setSection(section === 'customer' ? 'device' : 'repair')}
              className="flex h-[52px] flex-1 items-center justify-center rounded-2xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)]"
            >
              ถัดไป
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {loading ? 'กำลังบันทึก...' : 'บันทึก + พิมพ์ใบรับซ่อม'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}

const INPUT_CLS = 'h-[52px] w-full rounded-2xl border border-slate-200 bg-brand-light px-4 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/20'

function FormCard({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-[20px] bg-white p-4 shadow-[0_4px_20px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <p className="text-sm font-semibold text-brand-black">{title}</p>
      </div>
      <div className="flex flex-col gap-3.5">{children}</div>
    </div>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      {children}
      {error && <p className="text-xs text-brand-danger">{error}</p>}
    </div>
  )
}
