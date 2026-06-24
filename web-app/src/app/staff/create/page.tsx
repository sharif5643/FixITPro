'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronLeft, Camera, Loader2, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'

const schema = z.object({
  customerName:     z.string().min(1,'กรุณากรอกชื่อ'),
  customerPhone:    z.string().min(9,'เบอร์ไม่ถูกต้อง'),
  customerLineId:   z.string().optional(),
  deviceBrand:      z.string().min(1,'เลือกยี่ห้อ'),
  deviceModel:      z.string().min(1,'กรอกรุ่น'),
  deviceImei:       z.string().optional(),
  deviceSerial:     z.string().optional(),
  deviceColor:      z.string().optional(),
  issueTitle:       z.string().min(1,'เลือกอาการ'),
  issueDescription: z.string().optional(),
  estimatedCost:    z.string().optional(),
})
type Form = z.infer<typeof schema>

const STEPS = ['ข้อมูลลูกค้า','อาการเสีย','รูปภาพ','ประมาณการ'] as const
const BRANDS = ['Apple','Samsung','OPPO','Xiaomi','Vivo','Realme','Huawei','Nokia','อื่นๆ']
const ISSUES = ['จอแตก','แบตเสื่อม','ชาร์จไม่เข้า','เปิดไม่ติด','ตกน้ำ','กล้องเสีย','ลำโพงเสีย','ซอฟต์แวร์','อื่นๆ']

export default function CreateRepairPage() {
  const router  = useRouter()
  const [step,    setStep]    = useState(0)
  const [photos,  setPhotos]  = useState<File[]>([])
  const [loading, setLoading] = useState(false)

  const { register, handleSubmit, watch, setValue, formState:{errors} } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  function addPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPhotos(p => [...p, ...files].slice(0,4))
    e.target.value = ''
  }

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const fd = new FormData()
      Object.entries(data).forEach(([k,v]) => v && fd.append(k, v as string))
      photos.forEach(f => fd.append('photos', f))
      const res = await api.post('/repairs', fd, { headers:{'Content-Type':'multipart/form-data'} })
      toast.success('สร้างงานซ่อมสำเร็จ')
      router.replace(`/staff/repairs/${res.data.id}`)
    } catch { toast.error('สร้างงานซ่อมไม่สำเร็จ') }
    finally { setLoading(false) }
  }

  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
  }
  function prev() {
    if (step > 0) setStep(s => s - 1)
    else router.back()
  }

  const brand  = watch('deviceBrand')
  const issue  = watch('issueTitle')

  return (
    <div className="flex min-h-screen flex-col bg-[#F8F9FB]">
      {/* Header */}
      <div className="bg-white px-5 pb-0 pt-14 shadow-sm">
        <div className="flex items-center gap-3 pb-4">
          <button onClick={prev} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F8F9FB]">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
          <h1 className="flex-1 text-lg font-bold text-brand-black">รับงานซ่อม</h1>
        </div>
        {/* Step progress */}
        <div className="flex gap-0 pb-0">
          {STEPS.map((s, i) => (
            <button key={s} onClick={() => i < step && setStep(i)}
              className="flex flex-1 flex-col items-center gap-1 pb-0">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                i < step ? 'bg-brand-yellow text-brand-black' :
                i === step ? 'bg-brand-black text-white' : 'bg-slate-100 text-slate-400'
              }`}>{i+1}</div>
              <p className={`text-[9px] font-medium pb-2 ${i === step ? 'text-brand-black' : 'text-slate-400'}`}>{s}</p>
              <div className={`h-0.5 w-full ${i <= step ? 'bg-brand-yellow' : 'bg-slate-100'}`} />
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 p-5">
        {/* Step 0: Customer */}
        {step === 0 && (
          <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="relative mb-4">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                placeholder="ค้นหาลูกค้าจากชื่อ / เบอร์ / เลขใบรับซ่อม"
                className="h-11 w-full rounded-xl bg-[#F8F9FB] pl-10 pr-4 text-sm outline-none"
              />
            </div>
            <div className="flex flex-col gap-3.5">
              <Field label="ชื่อ - นามสกุล *" error={errors.customerName?.message}>
                <input {...register('customerName')} placeholder="สมชาย ใจดี" className={IC} />
              </Field>
              <Field label="เบอร์โทรศัพท์ *" error={errors.customerPhone?.message}>
                <input {...register('customerPhone')} type="tel" placeholder="088-123-4567" className={IC} />
              </Field>
              <Field label="LINE ID">
                <input {...register('customerLineId')} placeholder="somchai_jai" className={IC} />
              </Field>
            </div>
          </div>
        )}

        {/* Step 1: Device + Issue */}
        {step === 1 && (
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-3 text-sm font-semibold text-brand-black">ข้อมูลเครื่อง</p>
              <div className="flex flex-col gap-3.5">
                <Field label="ยี่ห้อ *" error={errors.deviceBrand?.message}>
                  <div className="flex flex-wrap gap-2">
                    {BRANDS.map(b => (
                      <button key={b} type="button"
                        onClick={() => setValue('deviceBrand', b, {shouldValidate:true})}
                        className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
                          brand === b ? 'bg-brand-yellow text-brand-black' : 'bg-[#F8F9FB] text-slate-500'
                        }`}>{b}</button>
                    ))}
                  </div>
                </Field>
                <Field label="รุ่น *" error={errors.deviceModel?.message}>
                  <input {...register('deviceModel')} placeholder="iPhone 15 Pro" className={IC} />
                </Field>
                <Field label="IMEI">
                  <input {...register('deviceImei')} placeholder="352040110393847" inputMode="numeric" className={IC} />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="S/N"><input {...register('deviceSerial')} className={IC} /></Field>
                  <Field label="สี"><input {...register('deviceColor')} placeholder="Black" className={IC} /></Field>
                </div>
              </div>
            </div>
            <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
              <p className="mb-3 text-sm font-semibold text-brand-black">อาการเสีย *</p>
              <div className="flex flex-wrap gap-2">
                {ISSUES.map(t => (
                  <button key={t} type="button"
                    onClick={() => setValue('issueTitle', t, {shouldValidate:true})}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                      issue === t ? 'bg-brand-yellow text-brand-black' : 'bg-[#F8F9FB] text-slate-600'
                    }`}>{t}</button>
                ))}
              </div>
              {errors.issueTitle && <p className="mt-2 text-xs text-red-500">{errors.issueTitle.message}</p>}
              <textarea
                {...register('issueDescription')}
                rows={3}
                placeholder="รายละเอียดเพิ่มเติม..."
                className="mt-3 w-full resize-none rounded-xl bg-[#F8F9FB] p-3 text-sm outline-none"
              />
            </div>
          </div>
        )}

        {/* Step 2: Photos */}
        {step === 2 && (
          <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <p className="mb-1 text-sm font-semibold text-brand-black">ถ่ายรูปอุปกรณ์</p>
            <p className="mb-4 text-xs text-slate-400">หน้าเครื่อง • หลังเครื่อง • รอยตำหนิ • อุปกรณ์ฝาก</p>
            <div className="grid grid-cols-2 gap-3">
              {photos.map((f,i) => (
                <div key={i} className="relative aspect-video overflow-hidden rounded-xl bg-[#F8F9FB]">
                  <img src={URL.createObjectURL(f)} className="h-full w-full object-cover" alt="" />
                  <button
                    type="button"
                    onClick={() => setPhotos(p => p.filter((_,j) => j !== i))}
                    className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500"
                  >
                    <X className="h-3.5 w-3.5 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < 4 && (
                <label className="flex aspect-video cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-[#F8F9FB]">
                  <Camera className="h-7 w-7 text-slate-300" />
                  <span className="text-xs text-slate-400">ถ่ายรูป</span>
                  <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={addPhoto} />
                </label>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Estimate */}
        {step === 3 && (
          <div className="rounded-2xl bg-white p-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <p className="mb-4 text-sm font-semibold text-brand-black">ราคาประเมิน</p>
            <Field label="ราคาประเมิน (บาท)">
              <input
                {...register('estimatedCost')}
                type="number"
                inputMode="decimal"
                placeholder="500"
                className={IC}
              />
            </Field>
          </div>
        )}
      </div>

      {/* Bottom buttons */}
      <div className="sticky bottom-[70px] flex gap-3 bg-[#F8F9FB] px-5 py-4 shadow-[0_-4px_20px_rgba(0,0,0,0.06)]">
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={next}
            className="flex h-14 flex-1 items-center justify-center rounded-2xl bg-brand-yellow text-base font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)]"
          >
            ถัดไป
          </button>
        ) : (
          <div className="flex flex-1 gap-3">
            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-[#F8F9FB] border border-slate-200 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              บันทึกงาน
            </button>
            <button
              type="button"
              onClick={handleSubmit(onSubmit)}
              disabled={loading}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] disabled:opacity-60"
            >
              พิมพ์ใบรับซ่อม
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

const IC = 'h-12 w-full rounded-xl border border-slate-200 bg-[#F8F9FB] px-4 text-sm outline-none focus:border-brand-yellow'
function Field({ label, error, children }: { label:string; error?:string; children:React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-slate-500">{label}</label>
      {children}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  )
}
