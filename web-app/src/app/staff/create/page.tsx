'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ArrowLeft, Camera, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'

const schema = z.object({
  repairType:       z.string().min(1, 'เลือกประเภทซ่อม'),
  issueTitle:       z.string().min(2, 'ระบุหัวข้อปัญหา'),
  issueDescription: z.string().min(5, 'อธิบายปัญหาอย่างน้อย 5 ตัวอักษร'),
  deviceBrand:      z.string().optional(),
  deviceModel:      z.string().optional(),
  customerName:     z.string().min(1, 'ระบุชื่อลูกค้า'),
  customerPhone:    z.string().optional(),
})
type Form = z.infer<typeof schema>

const REPAIR_TYPES = [
  'ซ่อมมือถือ',
  'ซ่อมแท็บเล็ต',
  'ซ่อมคอมพิวเตอร์',
  'ซ่อมโน้ตบุ๊ก',
  'ซ่อมเครื่องพิมพ์',
  'อื่นๆ',
]

export default function StaffCreatePage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [photos, setPhotos] = useState<File[]>([])

  const { register, handleSubmit, control, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    setPhotos((prev) => [...prev, ...files].slice(0, 4))
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx))
  }

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const body = new FormData()
      Object.entries(data).forEach(([k, v]) => { if (v) body.append(k, v) })
      photos.forEach((f) => body.append('photos', f))
      const res = await api.post('/repairs', body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      toast.success('แจ้งซ่อมสำเร็จ')
      router.replace(`/staff/repairs/${res.data.id}`)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="flex items-center gap-3 bg-white px-5 pt-12 pb-4 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
        <button onClick={() => router.back()} className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </button>
        <h1 className="text-base font-bold text-brand-black">แจ้งซ่อม</h1>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="px-5 py-5 space-y-4 pb-10">

        {/* ประเภทซ่อม */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-black">ประเภทซ่อม <span className="text-red-400">*</span></label>
          <Controller
            name="repairType"
            control={control}
            defaultValue=""
            render={({ field }) => (
              <select
                {...field}
                className="h-12 w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 text-sm outline-none focus:border-brand-yellow"
              >
                <option value="">เลือกประเภทซ่อม</option>
                {REPAIR_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
          />
          {errors.repairType && <p className="text-xs text-red-500">{errors.repairType.message}</p>}
        </div>

        {/* Device */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-black">ยี่ห้อ</label>
            <input
              placeholder="เช่น Samsung"
              {...register('deviceBrand')}
              className="h-12 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-brand-yellow"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-brand-black">รุ่น</label>
            <input
              placeholder="เช่น Galaxy S24"
              {...register('deviceModel')}
              className="h-12 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-brand-yellow"
            />
          </div>
        </div>

        {/* หัวข้อปัญหา */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-black">หัวข้อปัญหา <span className="text-red-400">*</span></label>
          <input
            placeholder="เช่น หน้าจอแตก"
            {...register('issueTitle')}
            className="h-12 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-brand-yellow"
          />
          {errors.issueTitle && <p className="text-xs text-red-500">{errors.issueTitle.message}</p>}
        </div>

        {/* รายละเอียด */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-black">รายละเอียดปัญหา <span className="text-red-400">*</span></label>
          <textarea
            rows={3}
            placeholder="อธิบายปัญหาโดยละเอียด..."
            {...register('issueDescription')}
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none resize-none focus:border-brand-yellow"
          />
          {errors.issueDescription && <p className="text-xs text-red-500">{errors.issueDescription.message}</p>}
        </div>

        {/* Customer */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-black">ชื่อลูกค้า <span className="text-red-400">*</span></label>
          <input
            placeholder="ชื่อ-นามสกุล"
            {...register('customerName')}
            className="h-12 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-brand-yellow"
          />
          {errors.customerName && <p className="text-xs text-red-500">{errors.customerName.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-black">เบอร์โทร</label>
          <input
            type="tel"
            placeholder="08xxxxxxxx"
            {...register('customerPhone')}
            className="h-12 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-brand-yellow"
          />
        </div>

        {/* Photos */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-brand-black">รูปภาพ (ไม่เกิน 4 รูป)</label>
          <div className="flex flex-wrap gap-2">
            {photos.map((f, idx) => (
              <div key={idx} className="relative h-20 w-20">
                <img
                  src={URL.createObjectURL(f)}
                  alt=""
                  className="h-full w-full rounded-xl object-cover"
                />
                <button
                  type="button"
                  onClick={() => removePhoto(idx)}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {photos.length < 4 && (
              <label className="flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-slate-400 hover:border-brand-yellow">
                <Camera className="h-6 w-6" />
                <span className="text-[10px]">ถ่ายภาพ</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  capture={Platform.isNative() ? 'environment' : undefined}
                  onChange={handlePhotoChange}
                />
              </label>
            )}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex h-13 items-center justify-center rounded-2xl bg-brand-yellow py-4 font-bold text-brand-black text-sm shadow-md active:scale-[0.98] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'ส่งงานแจ้งซ่อม'}
        </button>
      </form>
    </div>
  )
}
