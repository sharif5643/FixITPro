'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Store, User, Phone, Mail, Lock, ChevronRight, CheckCircle,
  Eye, EyeOff, Wrench, Palette, ImageIcon, AlertCircle,
} from 'lucide-react'
import api from '@/lib/api'

const businessTypes = [
  { value: 'mobile_repair', label: 'ร้านซ่อมมือถือ' },
  { value: 'mobile_shop',   label: 'ร้านขายมือถือ' },
  { value: 'both',          label: 'ขายและซ่อมมือถือ' },
  { value: 'accessories',   label: 'ร้านอุปกรณ์มือถือ' },
]

const colorPresets = [
  { value: '#2563eb', label: 'น้ำเงิน',  class: 'bg-blue-600' },
  { value: '#7c3aed', label: 'ม่วง',     class: 'bg-violet-600' },
  { value: '#059669', label: 'เขียว',    class: 'bg-emerald-600' },
  { value: '#dc2626', label: 'แดง',      class: 'bg-red-600' },
  { value: '#d97706', label: 'ส้ม',      class: 'bg-amber-600' },
  { value: '#0891b2', label: 'ฟ้า',      class: 'bg-cyan-600' },
]

const themePresets = [
  { value: 'light', label: 'Light — สว่าง' },
  { value: 'dark',  label: 'Dark — มืด' },
  { value: 'auto',  label: 'Auto — ตามระบบ' },
]

type FormState = {
  shopName: string
  ownerName: string
  phone: string
  email: string
  password: string
  confirmPassword: string
  businessType: string
  mainColor: string
  theme: string
  logo: File | null
}

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState<FormState>({
    shopName: '', ownerName: '', phone: '', email: '',
    password: '', confirmPassword: '', businessType: '',
    mainColor: '#2563eb', theme: 'light', logo: null,
  })
  const [showPass, setShowPass]       = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [submitted, setSubmitted]     = useState(false)
  const [isLoading, setIsLoading]     = useState(false)
  const [apiError, setApiError]       = useState<string | null>(null)
  const [errors, setErrors]           = useState<Partial<Record<keyof FormState, string>>>({})

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.shopName.trim())     e.shopName     = 'กรุณากรอกชื่อร้าน'
    if (!form.ownerName.trim())    e.ownerName    = 'กรุณากรอกชื่อเจ้าของ'
    if (!form.phone.trim())        e.phone        = 'กรุณากรอกเบอร์โทร'
    if (!form.email.trim())        e.email        = 'กรุณากรอกอีเมล'
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'รูปแบบอีเมลไม่ถูกต้อง'
    if (form.password.length < 8)  e.password     = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
    if (form.password !== form.confirmPassword) e.confirmPassword = 'รหัสผ่านไม่ตรงกัน'
    if (!form.businessType)        e.businessType = 'กรุณาเลือกประเภทธุรกิจ'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setApiError(null)
    if (!validate()) return

    setIsLoading(true)
    try {
      await api.post('/public/register', {
        shopName:     form.shopName.trim(),
        ownerName:    form.ownerName.trim(),
        phone:        form.phone.trim() || undefined,
        email:        form.email.trim().toLowerCase(),
        password:     form.password,
        businessType: form.businessType || undefined,
        themeColor:   form.mainColor || undefined,
        themePreset:  form.theme || undefined,
      })
      setSubmitted(true)
      setTimeout(() => router.push('/login'), 3000)
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ??
        'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
      setApiError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setIsLoading(false)
    }
  }

  function set(field: keyof FormState) {
    return (ev: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [field]: ev.target.value }))
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 pt-16 px-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">สมัครสำเร็จ!</h2>
          <p className="text-slate-500 mb-6">
            ระบบ FixITPro พร้อมใช้งานแล้ว ทดลองได้ฟรี 30 วัน
            <br />กำลังพาคุณไปหน้าเข้าสู่ระบบ…
          </p>
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 mb-8">
            <p className="font-semibold mb-1">ชื่อร้าน: {form.shopName}</p>
            <p>อีเมล: {form.email}</p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">
            เข้าสู่ระบบเลย
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg mb-4">
            <Wrench className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">สมัครทดลองใช้ฟรี 30 วัน</h1>
          <p className="text-slate-500">ไม่ต้องใช้บัตรเครดิต · ยกเลิกได้ทุกเมื่อ</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 space-y-6">

          {/* API error banner */}
          {apiError && (
            <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
              <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700 font-medium">{apiError}</p>
            </div>
          )}

          {/* Shop name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5"><Store className="h-4 w-4" />ชื่อร้าน <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              value={form.shopName}
              onChange={set('shopName')}
              placeholder="เช่น ร้านมือถือ JK Shop"
              className="w-full h-11 rounded-lg border border-slate-200 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.shopName && <p className="text-red-500 text-xs mt-1">{errors.shopName}</p>}
          </div>

          {/* Owner name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5"><User className="h-4 w-4" />ชื่อเจ้าของ <span className="text-red-500">*</span></span>
            </label>
            <input
              type="text"
              value={form.ownerName}
              onChange={set('ownerName')}
              placeholder="ชื่อ-นามสกุล"
              className="w-full h-11 rounded-lg border border-slate-200 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {errors.ownerName && <p className="text-red-500 text-xs mt-1">{errors.ownerName}</p>}
          </div>

          {/* Phone + Email row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />เบอร์โทร <span className="text-red-500">*</span></span>
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={set('phone')}
                placeholder="08x-xxx-xxxx"
                className="w-full h-11 rounded-lg border border-slate-200 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />อีเมล <span className="text-red-500">*</span></span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="owner@example.com"
                className="w-full h-11 rounded-lg border border-slate-200 px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>
          </div>

          {/* Password row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                <span className="flex items-center gap-1.5"><Lock className="h-4 w-4" />รหัสผ่าน <span className="text-red-500">*</span></span>
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  placeholder="อย่างน้อย 8 ตัว"
                  className="w-full h-11 rounded-lg border border-slate-200 px-3.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                  {showPass ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                ยืนยันรหัสผ่าน <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={form.confirmPassword}
                  onChange={set('confirmPassword')}
                  placeholder="ยืนยันรหัสผ่าน"
                  className="w-full h-11 rounded-lg border border-slate-200 px-3.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-600">
                  {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
              {errors.confirmPassword && <p className="text-red-500 text-xs mt-1">{errors.confirmPassword}</p>}
            </div>
          </div>

          {/* Business type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              ประเภทธุรกิจ <span className="text-red-500">*</span>
            </label>
            <select
              value={form.businessType}
              onChange={set('businessType')}
              className="w-full h-11 rounded-lg border border-slate-200 px-3.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">เลือกประเภทธุรกิจ</option>
              {businessTypes.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            {errors.businessType && <p className="text-red-500 text-xs mt-1">{errors.businessType}</p>}
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              <span className="flex items-center gap-1.5"><Palette className="h-4 w-4" />สีหลักของระบบ</span>
            </label>
            <div className="flex flex-wrap gap-3">
              {colorPresets.map(c => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, mainColor: c.value }))}
                  className={`h-10 w-10 rounded-xl ${c.class} flex items-center justify-center transition-all ${
                    form.mainColor === c.value ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'
                  }`}
                  title={c.label}
                >
                  {form.mainColor === c.value && <CheckCircle className="h-5 w-5 text-white" />}
                </button>
              ))}
            </div>
          </div>

          {/* Theme */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">Theme / รูปแบบ</label>
            <div className="grid grid-cols-3 gap-3">
              {themePresets.map(t => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, theme: t.value }))}
                  className={`py-2.5 rounded-lg border text-sm font-medium transition-all ${
                    form.theme === t.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Logo */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5"><ImageIcon className="h-4 w-4" />โลโก้ร้าน (ไม่บังคับ)</span>
            </label>
            <label className="flex flex-col items-center justify-center w-full h-28 rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              {form.logo ? (
                <div className="text-center">
                  <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-1" />
                  <p className="text-sm text-slate-600">{form.logo.name}</p>
                </div>
              ) : (
                <div className="text-center">
                  <ImageIcon className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">คลิกเพื่ออัปโหลด PNG, JPG</p>
                  <p className="text-xs text-slate-400 mt-1">ขนาดแนะนำ 200×200 px</p>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={e => setForm(f => ({ ...f, logo: e.target.files?.[0] ?? null }))}
              />
            </label>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <span className="inline-block h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                กำลังสร้างบัญชี…
              </>
            ) : (
              <>สมัครทดลองใช้ฟรี 30 วัน <ChevronRight className="h-5 w-5" /></>
            )}
          </button>

          <p className="text-center text-xs text-slate-400">
            มีบัญชีอยู่แล้ว?{' '}
            <Link href="/login" className="text-blue-600 hover:underline font-medium">เข้าสู่ระบบ</Link>
          </p>
        </form>

        {/* Trust */}
        <div className="flex flex-wrap justify-center gap-6 mt-8 text-sm text-slate-400">
          {['ไม่ต้องบัตรเครดิต', 'ยกเลิกได้ทุกเมื่อ', 'ข้อมูลปลอดภัย'].map(t => (
            <span key={t} className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />{t}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
