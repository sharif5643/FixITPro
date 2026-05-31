'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Smartphone, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAuthStore } from '@/store/auth.store'
import { Platform } from '@/lib/platform'
import api from '@/lib/api'

const loginSchema = z.object({
  email: z.string().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(6, 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const { setAuth, accessToken, user } = useAuthStore()

  useEffect(() => {
    if (accessToken && user) {
      if (user.role === 'SUPER_ADMIN') {
        router.replace('/super-admin/tenants')
      } else {
        router.replace(Platform.isNative() ? '/sunmi' : '/')
      }
    }
  }, [accessToken, user, router])

  // Debug: log API base URL on dev
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log('[FixITPro] API URL:', process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1')
    }
  }, [])

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'owner@fixitpro.com',
      password: 'admin1234',
    },
  })

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      const response = await api.post('/auth/login', {
        email: data.email,
        password: data.password,
      })
      const { accessToken, user, permissions = [], redirectTo } = response.data
      if (!accessToken || !user) {
        toast.error('รูปแบบข้อมูลจาก server ไม่ถูกต้อง')
        return
      }
      setAuth(user, accessToken, permissions)
      toast.success(`ยินดีต้อนรับกลับมา, ${user.name}!`)
      if (user.forcePasswordChange) {
        router.push('/change-password')
      } else if (Platform.isNative()) {
        router.push('/sunmi')
      } else {
        router.push(redirectTo ?? '/')
      }
    } catch (error: any) {
      if (error.response) {
        // HTTP error — show backend message
        const msg = error.response.data?.message
        toast.error(Array.isArray(msg) ? msg[0] : (msg ?? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'))
      } else {
        // Network error — server unreachable / CORS
        toast.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบว่า Backend รันอยู่ที่ port 3000')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 mb-4 shadow-lg shadow-blue-500/30">
            <Smartphone className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">FixITPro</h1>
          <p className="text-slate-400 mt-1.5 text-sm">ระบบจัดการร้านมือถือครบวงจร</p>
        </div>

        <Card className="shadow-2xl border-0 bg-white">
          <CardHeader className="space-y-1 pb-2">
            <CardTitle className="text-xl text-center font-bold">เข้าสู่ระบบ</CardTitle>
            <CardDescription className="text-center text-sm">
              กรอกข้อมูลเพื่อเข้าใช้งานระบบ
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">อีเมล</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="owner@fixitpro.com"
                  autoComplete="email"
                  disabled={isLoading}
                  {...register('email')}
                  className={errors.email ? 'border-red-400 focus-visible:ring-red-400' : ''}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">รหัสผ่าน</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={isLoading}
                    {...register('password')}
                    className={`pr-10 ${errors.password ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full h-11 text-base font-semibold mt-2"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    กำลังเข้าสู่ระบบ...
                  </>
                ) : (
                  'เข้าสู่ระบบ'
                )}
              </Button>
            </form>

            <div className="mt-5 rounded-lg bg-slate-50 border border-slate-200 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500 mb-1.5">บัญชีทดสอบ</p>
              <div className="space-y-1 text-xs text-slate-600">
                <p>
                  <span className="font-medium">เจ้าของร้าน:</span> owner@fixitpro.com
                </p>
                <p>
                  <span className="font-medium">รหัสผ่าน:</span> admin1234
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-slate-600 mt-6">
          © 2026 FixITPro · All rights reserved
        </p>
      </div>
    </div>
  )
}
