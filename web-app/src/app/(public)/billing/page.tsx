'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { QRCodeSVG } from 'qrcode.react'
import generatePayload from 'promptpay-qr'
import {
  CreditCard, Upload, CheckCircle, Building2, Star, ChevronRight, ArrowLeft, Copy, QrCode,
  AlertTriangle, XCircle, LogOut, Lock, Clock, Loader2, MessageCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/lib/api'
import { useAuthStore } from '@/store/auth.store'
import { getTenantExpiryState } from '@/lib/tenant-expiry'

// ── Types (GET /subscription/renewal-options, GET /subscription/payments) ─────

interface RenewPlan {
  key: string; name: string; description: string | null; monthlyPrice: number | null; current: boolean
  /** Modules the shop has now but would not have on this plan */
  loses: { key: string; name: string }[]
}
interface RenewTerm { months: number; days: number; discountPct: number }
interface RenewalOptions {
  payTo: { promptpayId: string | null; bankInfo: string | null; contactPhone: string | null }
  shopName: string
  plan: string
  status: string
  expiryDate: string | null
  plans: RenewPlan[]
  terms: RenewTerm[]
  hasPending: boolean
}
interface MyPayment {
  id: string; plan: string; duration: number; paymentAmount: number | null; status: 'PENDING' | 'VERIFIED' | 'REJECTED'
  adminNote: string | null; activatedAt: string | null; createdAt: string
}

type Step = 'select' | 'pay' | 'done'

const LINE_URL = 'https://line.me/R/ti/p/@fixitpro'

function formatPrice(n: number) {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 2 })
}
function thaiDate(iso: string) {
  return new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BillingPage() {
  const router = useRouter()
  const hasHydrated = useAuthStore((s) => s._hasHydrated)
  const user = useAuthStore((s) => s.user)
  const setAuth = useAuthStore((s) => s.setAuth)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const [fresh, setFresh] = useState(false)

  // The copy of the shop's expiry kept since login may be old (a renewal may already be
  // approved): ask the server again. This also refreshes the cookie the site uses to decide
  // whether to send the shop here.
  useEffect(() => {
    if (!hasHydrated || !user) return
    api.get('/auth/me')
      .then((res) => {
        const { permissions = [], enabledModules = [], ...userData } = res.data ?? {}
        if (userData?.id) setAuth(userData, permissions, enabledModules)
      })
      .catch(() => { /* the API client handles a lost session */ })
      .finally(() => setFresh(true))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated, !!user])

  async function logout() {
    try { await api.post('/auth/logout') } catch { /* best-effort */ }
    clearAuth()
    router.replace('/login')
  }

  if (!hasHydrated) return <Shell><Loading /></Shell>

  if (!user) {
    return (
      <Shell>
        <Card className="text-center">
          <Lock className="h-10 w-10 text-slate-300 mx-auto mb-3" />
          <h1 className="text-xl font-bold text-slate-900 mb-1">ต่ออายุ / ชำระค่าบริการ</h1>
          <p className="text-sm text-slate-500 mb-6">เข้าสู่ระบบด้วยบัญชีเจ้าของร้านเพื่อเลือกแพ็กเกจและส่งหลักฐานการชำระเงิน</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/login" className="px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700">เข้าสู่ระบบ</Link>
            <Link href="/pricing" className="px-6 py-3 rounded-xl border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50">ดูราคาแพ็กเกจ</Link>
          </div>
        </Card>
      </Shell>
    )
  }

  if (user.role === 'SUPER_ADMIN') {
    return (
      <Shell>
        <Card className="text-center">
          <p className="text-slate-600 mb-4">บัญชี Super Admin ไม่ต้องต่ออายุ — ตรวจสลิปของร้านได้ที่หน้าการชำระเงิน</p>
          <Link href="/super-admin/payments" className="px-6 py-3 rounded-xl bg-violet-600 text-white font-semibold">ไปหน้าการชำระเงิน</Link>
        </Card>
      </Shell>
    )
  }

  return (
    <Shell>
      <AccountBar name={user.name} shopName={user.shopName} onLogout={logout} />
      <ExpiryAlert expiryDate={user.tenantExpiryDate} status={user.tenantStatus} fresh={fresh} />
      {user.role === 'OWNER'
        ? <RenewFlow />
        : (
          <Card className="text-center">
            <p className="text-slate-700 font-medium mb-1">เฉพาะเจ้าของร้านเท่านั้นที่ต่ออายุได้</p>
            <p className="text-sm text-slate-500">กรุณาแจ้งเจ้าของร้านให้เข้าสู่ระบบแล้วต่ออายุที่หน้านี้</p>
          </Card>
        )}
    </Shell>
  )
}

// ── Layout bits ───────────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 space-y-6">{children}</div>
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-6 ${className}`}>{children}</div>
}

function Loading() {
  return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
}

function AccountBar({ name, shopName, onLogout }: { name: string; shopName?: string | null; onLogout: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-white border border-slate-100 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 truncate">{shopName ?? 'ร้านของคุณ'}</p>
        <p className="text-xs text-slate-500 truncate">เข้าสู่ระบบในชื่อ {name}</p>
      </div>
      <button
        type="button"
        onClick={onLogout}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
      >
        <LogOut className="h-4 w-4" />ออกจากระบบ
      </button>
    </div>
  )
}

function ExpiryAlert({ expiryDate, status, fresh }: { expiryDate?: string | null; status?: string | null; fresh: boolean }) {
  if (status === 'SUSPENDED') {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
        <Lock className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
        <div>
          <p className="font-semibold text-red-800">ร้านถูกระงับการใช้งานชั่วคราว</p>
          <p className="text-sm text-red-700 mt-1">ดูข้อมูลได้อย่างเดียว บันทึกไม่ได้ กรุณาติดต่อผู้ดูแลระบบทาง LINE @fixitpro</p>
        </div>
      </div>
    )
  }
  if (!expiryDate) return null
  const { state, graceDaysRemaining } = getTenantExpiryState(expiryDate)

  if (state === 'active') {
    if (!fresh) return null
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-emerald-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-emerald-800">แพ็กเกจใช้งานได้ถึง {thaiDate(expiryDate)}</p>
          <p className="text-sm text-emerald-700 mt-1">ต่ออายุล่วงหน้าได้ วันที่ซื้อเพิ่มจะต่อจากวันหมดอายุเดิม</p>
        </div>
        <Link href="/dashboard" className="shrink-0 text-sm font-semibold text-emerald-700 hover:underline">กลับไปใช้งาน</Link>
      </div>
    )
  }
  if (state === 'grace') {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div className="flex-1">
          <p className="font-semibold text-amber-800">แพ็กเกจหมดอายุเมื่อ {thaiDate(expiryDate)}</p>
          <p className="text-sm text-amber-700 mt-1">ยังใช้งานได้อีก {graceDaysRemaining} วัน หลังจากนั้นจะดูข้อมูลได้อย่างเดียว บันทึกไม่ได้</p>
        </div>
        <Link href="/dashboard" className="shrink-0 text-sm font-semibold text-amber-700 hover:underline">กลับไปใช้งาน</Link>
      </div>
    )
  }
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-5 flex items-start gap-3">
      <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
      <div>
        <p className="font-semibold text-red-800">แพ็กเกจหมดอายุแล้ว (เมื่อ {thaiDate(expiryDate)})</p>
        <p className="text-sm text-red-700 mt-1">ข้อมูลของร้านยังอยู่ครบ ต่ออายุแล้วจะกลับมาใช้งานได้ทันทีที่ทีมงานอนุมัติ</p>
      </div>
    </div>
  )
}

// ── Renewal: choose → pay and send the slip → waiting for approval ───────────

function RenewFlow() {
  const qc = useQueryClient()
  const [step, setStep] = useState<Step>('select')
  const [planKey, setPlanKey] = useState<string | null>(null)
  const [months, setMonths] = useState(1)
  const [amount, setAmount] = useState('')
  const [reference, setReference] = useState('')
  const [slip, setSlip] = useState<File | null>(null)
  const [copied, setCopied] = useState(false)
  const [confirmLoses, setConfirmLoses] = useState(false)

  const { data: opts, isLoading, isError } = useQuery<RenewalOptions>({
    queryKey: ['renewal-options'],
    queryFn: async () => (await api.get('/subscription/renewal-options')).data,
  })
  const { data: history = [] } = useQuery<MyPayment[]>({
    queryKey: ['my-renewal-payments'],
    queryFn: async () => (await api.get('/subscription/payments')).data,
  })

  // Start on the shop's own plan when it can renew it, else the first one offered
  useEffect(() => {
    if (!opts || planKey) return
    setPlanKey(opts.plans.find((p) => p.current)?.key ?? opts.plans[0]?.key ?? null)
  }, [opts, planKey])

  const plan = opts?.plans.find((p) => p.key === planKey) ?? null
  const term = opts?.terms.find((t) => t.months === months) ?? opts?.terms[0]
  const price = useMemo(() => {
    if (!plan?.monthlyPrice || !term) return null
    const base = plan.monthlyPrice * term.months
    const discount = Math.round(base * term.discountPct / 100)
    return { base, discount, total: base - discount }
  }, [plan, term])

  const submit = useMutation({
    mutationFn: async () => {
      const fd = new FormData()
      fd.append('plan', planKey!)
      fd.append('months', String(months))
      fd.append('amount', amount)
      if (reference.trim()) fd.append('reference', reference.trim())
      if (plan?.loses.length) fd.append('confirmLoses', String(confirmLoses))
      fd.append('slip', slip!)
      return (await api.post('/subscription/payments', fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data
    },
    onSuccess: () => {
      setStep('done')
      qc.invalidateQueries({ queryKey: ['renewal-options'] })
      qc.invalidateQueries({ queryKey: ['my-renewal-payments'] })
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message
      toast.error(Array.isArray(msg) ? msg[0] : msg ?? 'ส่งไม่สำเร็จ กรุณาลองใหม่')
    },
  })

  if (isLoading) return <Loading />
  if (isError || !opts) {
    return <Card className="text-center text-sm text-slate-500">โหลดข้อมูลแพ็กเกจไม่สำเร็จ กรุณารีเฟรชหน้า หรือติดต่อ LINE @fixitpro</Card>
  }

  const amountNum = Number(amount)
  const needsConfirm = !!plan && plan.loses.length > 0
  const canSend = !!planKey && !!slip && amountNum > 0 && !submit.isPending && (!needsConfirm || confirmLoses)

  return (
    <>
      {opts.hasPending && step !== 'done' && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex items-start gap-3">
          <Clock className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
          <p className="text-sm text-blue-800">มีรายการชำระเงินรอทีมงานตรวจสอบอยู่ เมื่ออนุมัติแล้วแพ็กเกจจะต่ออายุให้อัตโนมัติ (ดูสถานะด้านล่าง)</p>
        </div>
      )}

      {step === 'done' ? (
        <Card className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">ส่งหลักฐานเรียบร้อย</h2>
          <p className="text-sm text-slate-500">
            ทีมงานจะตรวจสอบและต่ออายุให้โดยเร็ว (เวลาทำการ 09:00–18:00)<br />
            ติดตามสถานะได้ที่ &quot;ประวัติการชำระเงิน&quot; ด้านล่าง หรือสอบถามทาง LINE @fixitpro
          </p>
        </Card>
      ) : opts.hasPending ? null : step === 'select' ? (
        <>
          <div className="text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg mb-3">
              <CreditCard className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">ต่ออายุ / ชำระค่าบริการ</h1>
            <p className="text-sm text-slate-500 mt-1">เลือกแพ็กเกจและระยะเวลา แล้วโอนเงินและแนบสลิป</p>
          </div>

          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">เลือกแพ็กเกจ</h2>
            {opts.plans.length === 0 ? (
              <p className="text-sm text-slate-500">ไม่มีแพ็กเกจให้เลือก กรุณาติดต่อ LINE @fixitpro</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {opts.plans.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => { setPlanKey(p.key); setConfirmLoses(false) }}
                    className={`relative text-left rounded-xl border-2 p-4 transition-all ${planKey === p.key ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                  >
                    {p.current && (
                      <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Star className="h-3 w-3" />แพ็กเกจปัจจุบัน
                      </span>
                    )}
                    <p className="font-bold text-slate-900">{p.name}</p>
                    {p.description && <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{p.description}</p>}
                    <p className="text-lg font-bold text-blue-600 mt-2">
                      {p.monthlyPrice != null
                        ? <>฿{formatPrice(p.monthlyPrice)}<span className="text-xs font-normal text-slate-400">/เดือน</span></>
                        : <span className="text-sm">ราคาตามที่ตกลงกับทีมงาน</span>}
                    </p>
                    {p.loses.length > 0 && (
                      <p className="text-xs text-red-600 mt-2">
                        <AlertTriangle className="inline h-3.5 w-3.5 mr-1 -mt-0.5" />
                        เมนูที่ใช้อยู่จะหายไป: {p.loses.map((m) => m.name).join(', ')}
                      </p>
                    )}
                  </button>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">ระยะเวลา</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {opts.terms.map((t) => (
                <button
                  key={t.months}
                  type="button"
                  onClick={() => setMonths(t.months)}
                  className={`rounded-xl border-2 py-3 text-center transition-all ${months === t.months ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="text-sm font-semibold text-slate-900">{t.months} เดือน</p>
                  {t.discountPct > 0 && <p className="text-xs text-emerald-600 font-medium mt-0.5">ประหยัด {t.discountPct}%</p>}
                </button>
              ))}
            </div>
          </Card>

          {plan && term && (
            <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-6 text-white">
              <h2 className="font-semibold mb-4">สรุป</h2>
              {price ? (
                <>
                  <div className="space-y-2 text-sm text-blue-100 mb-4">
                    <div className="flex justify-between"><span>{plan.name} × {term.months} เดือน</span><span>฿{formatPrice(price.base)}</span></div>
                    {price.discount > 0 && (
                      <div className="flex justify-between text-emerald-300"><span>ส่วนลด {term.discountPct}%</span><span>-฿{formatPrice(price.discount)}</span></div>
                    )}
                  </div>
                  <div className="flex justify-between text-xl font-bold border-t border-white/20 pt-4"><span>ยอดชำระ</span><span>฿{formatPrice(price.total)}</span></div>
                </>
              ) : (
                <p className="text-sm text-blue-100">{plan.name} × {term.months} เดือน — ยอดตามที่ตกลงกับทีมงาน (ใส่ยอดที่โอนในขั้นถัดไป)</p>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={!plan}
            onClick={() => { setAmount(price ? String(price.total) : ''); setStep('pay') }}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 shadow-lg disabled:opacity-40"
          >
            ถัดไป — ชำระเงิน <ChevronRight className="h-5 w-5" />
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={() => setStep('select')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" />กลับเลือกแพ็กเกจ
          </button>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
            <p className="text-sm font-medium text-blue-900">{plan?.name} · {months} เดือน</p>
            {price && <p className="text-2xl font-bold text-blue-700">฿{formatPrice(price.total)}</p>}
          </div>

          <PayTo payTo={opts.payTo} amount={amountNum > 0 ? amountNum : undefined} copied={copied} onCopy={(t) => {
            navigator.clipboard?.writeText(t).catch(() => {})
            setCopied(true); setTimeout(() => setCopied(false), 2000)
          }} />

          <Card>
            <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <Upload className="h-5 w-5 text-blue-600" />แนบสลิปการโอนเงิน
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">ยอดที่โอน (บาท) *</span>
                <input type="number" inputMode="decimal" min={1} value={amount} onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">เลขอ้างอิงในสลิป (ถ้ามี)</span>
                <input value={reference} maxLength={100} onChange={(e) => setReference(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>
            <label className="flex flex-col items-center justify-center w-full h-36 rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
              {slip ? (
                <div className="text-center">
                  <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                  <p className="text-sm text-slate-700 font-medium">{slip.name}</p>
                  <p className="text-xs text-slate-400 mt-1">แตะเพื่อเปลี่ยนรูป</p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-600">แตะเพื่อเลือกรูปสลิป</p>
                  <p className="text-xs text-slate-400 mt-1">JPG, PNG, WEBP ไม่เกิน 5 MB</p>
                </div>
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null
                  if (f && f.size > 5 * 1024 * 1024) { toast.error('ไฟล์ใหญ่เกิน 5 MB'); return }
                  setSlip(f)
                }} />
            </label>
          </Card>

          {needsConfirm && plan && (
            <label className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 cursor-pointer">
              <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmLoses} onChange={(e) => setConfirmLoses(e.target.checked)} />
              <span className="text-sm text-red-800">
                เข้าใจแล้วว่าเมื่อเปลี่ยนเป็นแพ็กเกจ {plan.name} เมนูต่อไปนี้จะใช้ไม่ได้: <b>{plan.loses.map((m) => m.name).join(', ')}</b>
                <span className="block text-xs text-red-700 mt-1">ข้อมูลเดิมไม่หาย ถ้าเปลี่ยนกลับเป็นแพ็กเกจที่ใหญ่ขึ้น เมนูจะกลับมา</span>
              </span>
            </label>
          )}

          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!canSend}
            className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold flex items-center justify-center gap-2 hover:opacity-90 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submit.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <>ส่งหลักฐานการชำระเงิน <ChevronRight className="h-5 w-5" /></>}
          </button>
        </>
      )}

      <PaymentHistory rows={history} />
    </>
  )
}

function PayTo({ payTo, amount, copied, onCopy }: {
  payTo: RenewalOptions['payTo']; amount?: number; copied: boolean; onCopy: (text: string) => void
}) {
  if (!payTo.promptpayId && !payTo.bankInfo) {
    return (
      <Card className="text-center">
        <MessageCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
        <p className="font-semibold text-slate-900">ขอเลขบัญชีสำหรับโอนได้ทาง LINE @fixitpro</p>
        <p className="text-sm text-slate-500 mt-1">โอนแล้วกลับมาแนบสลิปที่หน้านี้{payTo.contactPhone ? ` · โทร ${payTo.contactPhone}` : ''}</p>
        <a href={LINE_URL} target="_blank" rel="noreferrer" className="inline-block mt-4 px-5 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600">เปิด LINE</a>
      </Card>
    )
  }
  return (
    <>
      {payTo.promptpayId && (
        <Card className="text-center">
          <div className="flex items-center gap-2 justify-center mb-4">
            <QrCode className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">พร้อมเพย์</h2>
          </div>
          <div className="mx-auto w-fit rounded-xl bg-white p-3 border border-slate-200 mb-3">
            <QRCodeSVG value={generatePayload(payTo.promptpayId, amount ? { amount } : {})} size={180} level="M" />
          </div>
          <p className="text-sm text-slate-600">
            {payTo.promptpayId}
            <button type="button" onClick={() => onCopy(payTo.promptpayId!)} className="ml-2 inline-flex align-middle p-1 rounded hover:bg-slate-100" title="คัดลอก">
              {copied ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4 text-slate-400" />}
            </button>
          </p>
          {amount && <p className="text-xs text-slate-400 mt-1">QR นี้ใส่ยอด ฿{formatPrice(amount)} ไว้ให้แล้ว</p>}
        </Card>
      )}
      {payTo.bankInfo && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-slate-900">โอนเงินผ่านธนาคาร</h2>
          </div>
          <p className="text-sm text-slate-700 whitespace-pre-line">{payTo.bankInfo}</p>
        </Card>
      )}
    </>
  )
}

const STATUS_VIEW: Record<string, { label: string; cls: string }> = {
  PENDING:   { label: 'รอตรวจสอบ',       cls: 'bg-blue-50 text-blue-700' },
  VERIFIED:  { label: 'ตรวจแล้ว รอเปิดใช้', cls: 'bg-amber-50 text-amber-700' },
  ACTIVATED: { label: 'ต่ออายุแล้ว',       cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED:  { label: 'ไม่ผ่าน',          cls: 'bg-red-50 text-red-700' },
}

function PaymentHistory({ rows }: { rows: MyPayment[] }) {
  if (rows.length === 0) return null
  return (
    <Card>
      <h2 className="text-base font-semibold text-slate-900 mb-3">ประวัติการชำระเงิน</h2>
      <div className="divide-y divide-slate-100">
        {rows.map((r) => {
          const v = STATUS_VIEW[r.activatedAt ? 'ACTIVATED' : r.status] ?? STATUS_VIEW.PENDING
          return (
            <div key={r.id} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{r.plan} · {Math.round(r.duration / 30)} เดือน{r.paymentAmount != null ? ` · ฿${formatPrice(r.paymentAmount)}` : ''}</p>
                <p className="text-xs text-slate-500">ส่งเมื่อ {thaiDate(r.createdAt)}</p>
                {r.status === 'REJECTED' && r.adminNote && <p className="text-xs text-red-600 mt-1">เหตุผล: {r.adminNote}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${v.cls}`}>{v.label}</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
