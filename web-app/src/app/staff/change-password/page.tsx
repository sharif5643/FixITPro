'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Lock, Loader2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'

export default function StaffChangePasswordPage() {
  const router     = useRouter()
  const updateUser = useAuthStore((s) => s.updateUser)

  const [current,  setCurrent]  = useState('')
  const [next,     setNext]     = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [showCur,  setShowCur]  = useState(false)
  const [showNew,  setShowNew]  = useState(false)
  const [loading,  setLoading]  = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (next.length < 8)      { toast.error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'); return }
    if (next !== confirm)     { toast.error('รหัสผ่านไม่ตรงกัน'); return }
    if (!current)             { toast.error('กรุณากรอกรหัสผ่านปัจจุบัน'); return }
    setLoading(true)
    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next })
      updateUser({ forcePasswordChange: false })
      toast.success('เปลี่ยนรหัสผ่านสำเร็จ')
      router.replace('/staff/home')
    } catch (err: any) {
      toast.error(err?.response?.data?.message ?? 'เปลี่ยนรหัสผ่านไม่สำเร็จ')
    } finally { setLoading(false) }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F8F9FB] px-6">
      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="mb-6 flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-yellow shadow-[0_6px_24px_rgba(255,193,7,0.35)]">
            <ShieldCheck className="h-8 w-8 text-brand-black"/>
          </div>
          <div>
            <h1 className="text-center text-xl font-bold text-brand-black">ตั้งรหัสผ่านใหม่</h1>
            <p className="mt-1 text-center text-sm text-slate-400">กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน</p>
          </div>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-[0_2px_24px_rgba(0,0,0,0.08)]">
          {/* Current password */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">รหัสผ่านปัจจุบัน</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
              <input
                type={showCur ? 'text' : 'password'}
                value={current} onChange={e=>setCurrent(e.target.value)}
                placeholder="รหัสผ่านปัจจุบัน"
                required
                className="h-12 w-full rounded-xl border border-slate-200 bg-[#F8F9FB] pl-11 pr-12 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/20"
              />
              <button type="button" onClick={()=>setShowCur(v=>!v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                {showCur ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            </div>
          </div>

          {/* New password */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">รหัสผ่านใหม่ (อย่างน้อย 8 ตัว)</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"/>
              <input
                type={showNew ? 'text' : 'password'}
                value={next} onChange={e=>setNext(e.target.value)}
                placeholder="รหัสผ่านใหม่"
                required
                className="h-12 w-full rounded-xl border border-slate-200 bg-[#F8F9FB] pl-11 pr-12 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/20"
              />
              <button type="button" onClick={()=>setShowNew(v=>!v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">
                {showNew ? <EyeOff className="h-4 w-4"/> : <Eye className="h-4 w-4"/>}
              </button>
            </div>
          </div>

          {/* Confirm */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-500">ยืนยันรหัสผ่านใหม่</label>
            <input
              type="password"
              value={confirm} onChange={e=>setConfirm(e.target.value)}
              placeholder="ยืนยันรหัสผ่านใหม่"
              required
              className={`h-12 w-full rounded-xl border bg-[#F8F9FB] px-4 text-sm outline-none focus:ring-2 ${
                confirm && confirm !== next
                  ? 'border-red-300 focus:border-red-400 focus:ring-red-200'
                  : 'border-slate-200 focus:border-brand-yellow focus:ring-brand-yellow/20'
              }`}
            />
            {confirm && confirm !== next && (
              <p className="mt-1 text-xs text-red-500">รหัสผ่านไม่ตรงกัน</p>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-yellow text-sm font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] disabled:opacity-60">
            {loading ? <Loader2 className="h-4 w-4 animate-spin"/> : 'บันทึกรหัสผ่านใหม่'}
          </button>
        </form>
      </div>
    </div>
  )
}
