'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, Loader2, User, Lock, X, ArrowRight, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAuthStore } from '@/store/auth.store'
import api from '@/lib/api'

const schema = z.object({
  email:    z.string().min(1, 'กรุณากรอกชื่อผู้ใช้'),
  password: z.string().min(6, 'รหัสผ่านอย่างน้อย 6 ตัวอักษร'),
  remember: z.boolean().optional(),
})
type Form = z.infer<typeof schema>

/* ─── Faint circuit bg (white page, very low opacity) ─────────────── */
function CircuitBg() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.025]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <line x1="0"   y1="12%"  x2="25%"  y2="12%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="25%" y1="12%"  x2="25%"  y2="25%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="25%" y1="25%"  x2="60%"  y2="25%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="60%" y1="25%"  x2="60%"  y2="15%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="60%" y1="15%"  x2="100%" y2="15%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="0"   y1="70%"  x2="30%"  y2="70%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="30%" y1="70%"  x2="30%"  y2="85%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="30%" y1="85%"  x2="75%"  y2="85%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="75%" y1="85%"  x2="75%"  y2="75%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="75%" y1="75%"  x2="100%" y2="75%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="80%" y1="0"    x2="80%"  y2="15%"  stroke="#FFC107" strokeWidth="1.5"/>
      <line x1="50%" y1="0"    x2="50%"  y2="8%"   stroke="#FFC107" strokeWidth="1.5"/>
      {([
        [25,12],[60,25],[60,15],[30,70],[30,85],[75,85],[75,75],[80,15],[50,8],
      ] as [number,number][]).map(([cx,cy],i) => (
        <circle key={i} cx={`${cx}%`} cy={`${cy}%`} r="3" fill="#FFC107"/>
      ))}
      <rect x="23%" y="10%" width="5%" height="2.5%" rx="1" fill="none" stroke="#FFC107" strokeWidth="0.8"/>
      <rect x="58%" y="23%" width="5%" height="2.5%" rx="1" fill="none" stroke="#FFC107" strokeWidth="0.8"/>
    </svg>
  )
}

function LoginForm() {
  const router  = useRouter()
  const params  = useSearchParams()
  const setAuth = useAuthStore((s) => s.setAuth)

  const [showPw,   setShowPw]   = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [mounted,  setMounted]  = useState(false)
  const [remember, setRemember] = useState(false)

  useEffect(() => {
    setMounted(true)
    const e = params.get('error')
    if (e === 'google_failed')       toast.error('Google login ไม่สำเร็จ')
    if (e === 'line_failed')         toast.error('LINE login ไม่สำเร็จ')
    if (e === 'line_not_configured') toast.error('LINE login ยังไม่ได้ตั้งค่า')
  }, [params])

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const emailVal = watch('email')

  async function onSubmit(data: Form) {
    setLoading(true)
    try {
      const res = await api.post('/auth/login', {
        email:    data.email.trim().toLowerCase(),
        password: data.password,
      })
      const { permissions = [], enabledModules = [], ...user } = res.data
      setAuth(user, permissions, enabledModules)
      router.replace('/staff/home')
    } catch (err: any) {
      const msg = err?.response?.data?.message
      toast.error(msg || 'อีเมล/รหัสผ่านไม่ถูกต้อง')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col items-center overflow-x-hidden bg-white">
      <CircuitBg />

      {/* ─── Scrollable content ─── */}
      <div className="relative z-10 flex w-full max-w-md flex-col px-6 pb-10">

        {/* ── Logo header ── */}
        <div className={`flex flex-col items-center pt-16 pb-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}>
          {/* Icon box */}
          <div
            className="splash-glow flex h-[80px] w-[80px] items-center justify-center rounded-[22px] shadow-[0_8px_32px_rgba(255,193,7,0.35)]"
            style={{ background: 'linear-gradient(145deg, #FF8C00 0%, #FFC107 100%)' }}
          >
            <svg viewBox="0 0 48 48" width="44" height="44" fill="none">
              <path d="M30 4L12 26h14L18 44l20-22H24L30 4z" fill="white"/>
            </svg>
          </div>

          {/* App name */}
          <div className="mt-4 flex items-end justify-center">
            <span className="text-[28px] font-black leading-none text-[#111111]">Fix</span>
            <svg viewBox="0 0 16 26" width="11" height="18" className="mb-[3px] mx-[1px]">
              <path d="M12 1L3 14h7L4 25 15 12H8L12 1z" fill="#FF8C00"/>
            </svg>
            <span className="text-[28px] font-black leading-none text-[#111111]">T</span>
            <span className="text-[28px] font-black leading-none text-[#FFC107] ml-[2px]">Pro</span>
          </div>
          <p className="mt-1 text-[12px] text-slate-400">ระบบจัดการร้านมือถือครบวงจร</p>
        </div>

        {/* ── Form card ── */}
        <div className={`transition-all duration-700 delay-150 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
          {/* Welcome text */}
          <h1 className="text-[22px] font-bold text-[#111111]">ยินดีต้อนรับกลับ</h1>
          <p className="mt-1 mb-6 text-sm text-slate-400">เข้าสู่ระบบเพื่อใช้งาน FixITPro</p>

          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">

            {/* Username */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-500">อีเมล / ชื่อผู้ใช้</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400"/>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder="อีเมลที่ใช้สมัคร"
                  {...register('email')}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8F9FB] pl-11 pr-11 text-sm text-[#111] outline-none transition-all focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                />
                {emailVal && (
                  <button
                    type="button"
                    onClick={() => setValue('email', '')}
                    className="absolute right-4 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-slate-500 hover:bg-slate-300"
                  >
                    <X className="h-3 w-3"/>
                  </button>
                )}
              </div>
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[13px] font-semibold text-slate-500">รหัสผ่าน</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400"/>
                <input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="รหัสผ่าน"
                  {...register('password')}
                  className="h-14 w-full rounded-2xl border border-[#E5E7EB] bg-[#F8F9FB] pl-11 pr-12 text-sm text-[#111] outline-none transition-all focus:border-[#FFC107] focus:ring-2 focus:ring-[#FFC107]/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400"
                >
                  {showPw ? <EyeOff className="h-[17px] w-[17px]"/> : <Eye className="h-[17px] w-[17px]"/>}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {/* Remember + Forgot */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setRemember(v => !v)}
                className="flex items-center gap-2"
              >
                <div
                  className="flex h-5 w-5 items-center justify-center rounded-md border-2 transition-all"
                  style={{
                    borderColor: remember ? '#FFC107' : '#E5E7EB',
                    backgroundColor: remember ? '#FFC107' : 'white',
                  }}
                >
                  {remember && (
                    <svg viewBox="0 0 10 8" width="10" height="8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  )}
                </div>
                <span className="text-sm text-slate-500">จดจำการเข้าสู่ระบบ</span>
              </button>
              <button type="button" className="text-sm font-semibold text-[#F59E0B]">
                ลืมรหัสผ่าน?
              </button>
            </div>

            {/* Login button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-2 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#FFC107] text-base font-bold text-[#111111] shadow-[0_6px_24px_rgba(255,193,7,0.45)] transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin"/>
              ) : (
                <>เข้าสู่ระบบ<ArrowRight className="h-5 w-5"/></>
              )}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-slate-100"/>
              <span className="text-xs text-slate-400">หรือเข้าสู่ระบบด้วย</span>
              <div className="h-px flex-1 bg-slate-100"/>
            </div>

            {/* Social buttons — side by side */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { window.location.href = '/api/v1/auth/google' }}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl border border-[#E5E7EB] bg-white py-3 text-sm font-semibold text-slate-700 active:bg-slate-50"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Google
              </button>

              <button
                type="button"
                onClick={() => { window.location.href = '/api/v1/auth/line' }}
                className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#06C755] py-3 text-sm font-semibold text-white active:opacity-90"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="white">
                  <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.348 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314"/>
                </svg>
                LINE
              </button>
            </div>

            {/* Security badge */}
            <div className="mt-2 flex items-center gap-3 rounded-2xl border border-[#FFC107]/20 bg-[#FFFBEB] px-4 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FFC107]/15">
                <ShieldCheck className="h-5 w-5 text-[#F59E0B]"/>
              </div>
              <div>
                <p className="text-[13px] font-bold text-[#111111]">ปลอดภัย 100%</p>
                <p className="text-[11px] text-slate-400">ข้อมูลของคุณเข้ารหัสตามมาตรฐานสากล</p>
              </div>
            </div>

          </form>
        </div>

        {/* Version */}
        <p className="mt-8 text-center text-[11px] tracking-widest text-slate-300 uppercase">
          Version 2.0.0
        </p>
      </div>
    </div>
  )
}

export default function StaffLoginPage() {
  return <Suspense><LoginForm /></Suspense>
}
