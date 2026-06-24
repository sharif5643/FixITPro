'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, Wrench } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

const schema = z.object({
  email:    z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
})
type Form = z.infer<typeof schema>

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const err = searchParams.get('error')
    if (err === 'google_failed')       toast.error('เข้าสู่ระบบด้วย Google ไม่สำเร็จ')
    if (err === 'line_failed')         toast.error('เข้าสู่ระบบด้วย LINE ไม่สำเร็จ')
    if (err === 'line_not_configured') toast.error('LINE login ยังไม่ได้ตั้งค่า')
  }, [searchParams])

  const { register, handleSubmit, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', data)
      const { permissions = [], enabledModules = [], ...user } = res.data
      setAuth(user, permissions, enabledModules)
      router.replace('/staff/home')
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'เข้าสู่ระบบไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* Hero header */}
      <div className="relative overflow-hidden bg-brand-black px-6 pb-10 pt-16">
        <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-yellow/10" />
        <div className="absolute -bottom-6 -left-6 h-28 w-28 rounded-full bg-brand-yellow/5" />
        <div className="relative flex flex-col gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-yellow shadow-[0_4px_20px_rgba(255,193,7,0.5)]">
            <Wrench className="h-7 w-7 text-brand-black" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-medium text-white/50">ยินดีต้อนรับ</p>
            <h1 className="text-2xl font-bold text-white">
              เข้าสู่ระบบ <span className="text-brand-yellow">FixITPro</span>
            </h1>
          </div>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 rounded-t-3xl bg-white px-6 pb-8 pt-8 -mt-4">
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700">ชื่อผู้ใช้ / อีเมล</label>
            <input
              type="email"
              autoComplete="email"
              placeholder="example@email.com"
              {...register('email')}
              className="h-[52px] rounded-2xl border border-slate-200 bg-brand-light px-4 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/20"
            />
            {errors.email && <p className="text-xs text-brand-danger">{errors.email.message}</p>}
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-semibold text-slate-700">รหัสผ่าน</label>
              <button type="button" className="text-xs font-medium text-brand-yellow">
                ลืมรหัสผ่าน?
              </button>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                {...register('password')}
                className="h-[52px] w-full rounded-2xl border border-slate-200 bg-brand-light px-4 pr-12 text-sm outline-none focus:border-brand-yellow focus:ring-2 focus:ring-brand-yellow/20"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-brand-danger">{errors.password.message}</p>}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex h-[52px] items-center justify-center rounded-2xl bg-brand-yellow font-bold text-brand-black shadow-[0_4px_16px_rgba(255,193,7,0.4)] active:scale-[0.98] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'เข้าสู่ระบบ'}
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-100" />
            <span className="text-xs text-slate-400">หรือเข้าสู่ระบบด้วย</span>
            <div className="flex-1 h-px bg-slate-100" />
          </div>

          {/* Google */}
          <button
            type="button"
            onClick={() => { window.location.href = '/api/v1/auth/google' }}
            className="flex h-[52px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 active:bg-slate-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            เข้าสู่ระบบด้วย Google
          </button>

          {/* LINE */}
          <button
            type="button"
            onClick={() => { window.location.href = '/api/v1/auth/line' }}
            className="flex h-[52px] items-center justify-center gap-3 rounded-2xl bg-[#06C755] text-sm font-semibold text-white active:bg-[#05b34c]"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="white">
              <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
            </svg>
            เข้าสู่ระบบด้วย LINE
          </button>

          <p className="text-center text-xs text-slate-400 pt-2">
            ยังไม่มีบัญชี?{' '}
            <span className="font-semibold text-brand-black">ติดต่อผู้จัดการร้าน</span>
          </p>
        </form>
      </div>
    </div>
  )
}

export default function StaffLoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
