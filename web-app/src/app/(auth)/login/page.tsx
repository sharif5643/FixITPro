'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Smartphone, Loader2, Eye, EyeOff, Clock,
  Wrench, ShoppingCart, BarChart2, Shield, Zap, Globe,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'

const loginSchema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
})

type LoginForm = z.infer<typeof loginSchema>

const FEATURES = [
  { icon: Wrench,       label: 'จัดการงานซ่อม',      desc: 'ติดตามสถานะ อัปเดตลูกค้าแบบเรียลไทม์' },
  { icon: ShoppingCart, label: 'POS ขายสินค้า',       desc: 'คิดเงินเร็ว รองรับบาร์โค้ดและ QR' },
  { icon: BarChart2,    label: 'รายงานเชิงลึก',       desc: 'วิเคราะห์รายได้ สต็อก และประสิทธิภาพช่าง' },
  { icon: Shield,       label: 'ปลอดภัย หลายสาขา',   desc: 'ควบคุมสิทธิ์แยกตามตำแหน่ง' },
]

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [throttleCountdown, setThrottleCountdown] = useState(0)
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const { setAuth, user } = useAuthStore()

  useEffect(() => {
    if (user) {
      router.replace(user.role === 'SUPER_ADMIN' ? '/super-admin' : Platform.isNative() ? '/sunmi' : '/dashboard')
    }
  }, [user, router])

  useEffect(() => {
    if (throttleCountdown <= 0) return
    countdownRef.current = setInterval(() => {
      setThrottleCountdown(prev => {
        if (prev <= 1) { if (countdownRef.current) clearInterval(countdownRef.current); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => { if (countdownRef.current) clearInterval(countdownRef.current) }
  }, [throttleCountdown])

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = async (data: LoginForm) => {
    if (throttleCountdown > 0) return
    setIsLoading(true)
    try {
      const response = await api.post('/auth/login', {
        email: data.email.trim().toLowerCase(),
        password: data.password,
      })
      const { user: userData, permissions = [], enabledModules = [], redirectTo } = response.data
      if (!userData) { toast.error('รูปแบบข้อมูลจาก server ไม่ถูกต้อง'); return }
      setAuth(userData, permissions, enabledModules)
      toast.success(`ยินดีต้อนรับกลับมา, ${userData.name}!`)
      if (userData.forcePasswordChange) router.push('/change-password')
      else if (Platform.isNative()) router.push('/sunmi')
      else router.push(redirectTo ?? '/dashboard')
    } catch (error: any) {
      if (error.response) {
        const { status, data: resData } = error.response
        if (status === 429) {
          const retryAfter = resData?.retryAfter ?? 60
          setThrottleCountdown(retryAfter)
          toast.error(`เข้าสู่ระบบบ่อยเกินไป กรุณารอ ${retryAfter} วินาที`, { duration: 5000 })
        } else {
          const msg = resData?.message
          toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'))
        }
      } else {
        toast.error(`ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้`)
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-[#F8FAFC] dark:bg-[#0F172A]">
      {/* ── Left brand panel (desktop only) ─────────────────────── */}
      <div className="hidden lg:flex flex-col flex-1 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 relative overflow-hidden p-10 xl:p-14">
        {/* Decorative circles */}
        <div className="absolute -top-20 -left-20 h-80 w-80 rounded-full bg-white/5" />
        <div className="absolute top-1/3 -right-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="absolute -bottom-10 left-1/4 h-40 w-40 rounded-full bg-white/8" />

        {/* Logo */}
        <div className="relative flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 border border-white/25 backdrop-blur-sm shadow-lg">
            <Smartphone className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xl font-bold text-white leading-none">FixITPro</p>
            <p className="text-[11px] text-blue-200 mt-0.5 font-medium">Mobile Shop Management</p>
          </div>
        </div>

        {/* Hero */}
        <div className="relative mt-auto mb-10">
          <h1 className="text-4xl xl:text-5xl font-extrabold text-white leading-tight tracking-tight">
            ระบบจัดการ<br />ร้านมือถือ<br />
            <span className="text-blue-200">ครบวงจร</span>
          </h1>
          <p className="text-blue-200 mt-4 text-base leading-relaxed max-w-sm">
            จัดการซ่อม ขายสินค้า ควบคุมสต็อก และดูรายงาน<br />ทั้งหมดในที่เดียว พร้อมรองรับหลายสาขา
          </p>
        </div>

        {/* Feature pills */}
        <div className="relative grid grid-cols-1 xl:grid-cols-2 gap-3">
          {FEATURES.map(({ icon: Icon, label, desc }) => (
            <div key={label} className="flex items-start gap-3 bg-white/10 backdrop-blur-sm border border-white/15 rounded-2xl p-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
                <Icon className="h-4 w-4 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white leading-none">{label}</p>
                <p className="text-xs text-blue-200 mt-1 leading-snug">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="relative mt-6 flex items-center gap-2 text-blue-300">
          <Globe className="h-3.5 w-3.5" />
          <span className="text-xs">ข้อมูลปลอดภัย · อัปเดตแบบเรียลไทม์ · รองรับ SUNMI POS</span>
        </div>
      </div>

      {/* ── Right form panel ───────────────────────────────────── */}
      <div className="w-full lg:w-[420px] xl:w-[460px] flex flex-col items-center justify-center p-6 sm:p-10 relative">
        {/* Mobile logo */}
        <div className="lg:hidden flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 mb-3 shadow-fi-primary">
            <Smartphone className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">FixITPro</h1>
          <p className="text-slate-400 text-sm mt-1">ระบบจัดการร้านมือถือครบวงจร</p>
        </div>

        <div className="w-full max-w-sm">
          <div className="mb-7">
            <h2 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">เข้าสู่ระบบ</h2>
            <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">กรอกข้อมูลบัญชีของคุณเพื่อเข้าใช้งาน</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* Email */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                อีเมล
              </label>
              <input
                id="email"
                type="email"
                placeholder="owner@fixitpro.com"
                autoComplete="email"
                disabled={isLoading}
                {...register('email')}
                className={`w-full h-11 px-4 rounded-xl border text-sm bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:border-blue-500 disabled:opacity-50 ${
                  errors.email
                    ? 'border-red-400 focus:ring-red-400'
                    : 'border-slate-200 dark:border-slate-700/60 focus:ring-blue-500 hover:border-slate-300'
                }`}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                รหัสผ่าน
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  disabled={isLoading}
                  {...register('password')}
                  className={`w-full h-11 pl-4 pr-11 rounded-xl border text-sm bg-white dark:bg-[#1E293B] text-slate-900 dark:text-white placeholder:text-slate-400 transition-all focus:outline-none focus:ring-2 focus:border-blue-500 disabled:opacity-50 ${
                    errors.password
                      ? 'border-red-400 focus:ring-red-400'
                      : 'border-slate-200 dark:border-slate-700/60 focus:ring-blue-500 hover:border-slate-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading || throttleCountdown > 0}
              className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-all shadow-fi-primary hover:shadow-fi-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />กำลังเข้าสู่ระบบ...</>
              ) : throttleCountdown > 0 ? (
                <><Clock className="h-4 w-4" />รอ {throttleCountdown} วินาที</>
              ) : (
                <><Zap className="h-4 w-4" />เข้าสู่ระบบ</>
              )}
            </button>

            {throttleCountdown > 0 && (
              <p className="text-center text-xs text-red-500">
                เข้าสู่ระบบผิดพลาดบ่อยเกินไป — ปลดล็อกใน {throttleCountdown} วินาที
              </p>
            )}
          </form>

          {/* Demo account */}
          <div className="mt-6 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 px-4 py-3.5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wide">
              บัญชีทดสอบ
            </p>
            <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
              <p><span className="font-semibold text-slate-700 dark:text-slate-300">เจ้าของร้าน:</span> owner@fixitpro.com</p>
              <p><span className="font-semibold text-slate-700 dark:text-slate-300">รหัสผ่าน:</span> admin1234</p>
            </div>
          </div>

          <p className="text-center text-xs text-slate-400 dark:text-slate-600 mt-6">
            © 2026 FixITPro · All rights reserved
          </p>
        </div>
      </div>
    </div>
  )
}
