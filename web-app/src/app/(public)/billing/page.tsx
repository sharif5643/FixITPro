'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  CreditCard, Upload, CheckCircle, Building2, Star,
  ChevronRight, ArrowLeft, Copy, QrCode, AlertTriangle, XCircle,
} from 'lucide-react'
import { useAuthStore } from '@/store/auth.store'
import { getTenantExpiryState } from '@/lib/tenant-expiry'

const plans = [
  { id: 'starter',    name: 'Starter',    price: 990,   period: 'เดือน', branches: '1 สาขา' },
  { id: 'business',   name: 'Business',   price: 1990,  period: 'เดือน', branches: '3 สาขา', popular: true },
  { id: 'enterprise', name: 'Enterprise', price: 3990,  period: 'เดือน', branches: 'ไม่จำกัดสาขา' },
  { id: 'unlimited',  name: 'Unlimited',  price: 5990,  period: 'เดือน', branches: 'ทุกฟีเจอร์' },
]

const durationOptions = [
  { value: 1,  label: '1 เดือน',  discount: 0 },
  { value: 3,  label: '3 เดือน',  discount: 5 },
  { value: 6,  label: '6 เดือน',  discount: 10 },
  { value: 12, label: '12 เดือน', discount: 20 },
]

const bankAccounts = [
  { bank: 'กสิกรไทย (KBank)', number: '123-4-56789-0', name: 'บริษัท ฟิกซ์ไอที จำกัด', color: 'bg-emerald-600' },
  { bank: 'ไทยพาณิชย์ (SCB)', number: '987-6-54321-0', name: 'บริษัท ฟิกซ์ไอที จำกัด', color: 'bg-purple-700' },
]

function formatPrice(n: number) {
  return n.toLocaleString('th-TH')
}

type Step = 'select' | 'pay' | 'done'

function ExpiryAlert() {
  const user = useAuthStore((state) => state.user)
  if (!user || !user.tenantExpiryDate || user.role === 'SUPER_ADMIN') return null

  const { state, graceDaysRemaining } = getTenantExpiryState(user.tenantExpiryDate)
  const expiryFormatted = new Date(user.tenantExpiryDate).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  if (state === 'expired') {
    return (
      <div className="mb-8 rounded-xl border border-red-200 bg-red-50 p-5">
        <div className="flex items-start gap-3">
          <XCircle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-red-800">แพ็กเกจหมดอายุแล้ว</p>
            {user.shopName && <p className="text-sm text-red-700 mt-0.5">ร้าน: {user.shopName}</p>}
            <p className="text-sm text-red-700">วันหมดอายุ: {expiryFormatted}</p>
            <p className="text-sm text-red-700 mt-1">กรุณาต่ออายุเพื่อกลับมาใช้งานระบบ</p>
          </div>
        </div>
      </div>
    )
  }

  if (state === 'grace') {
    return (
      <div className="mb-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-amber-800">แพ็กเกจของคุณหมดอายุแล้ว</p>
            {user.shopName && <p className="text-sm text-amber-700 mt-0.5">ร้าน: {user.shopName}</p>}
            <p className="text-sm text-amber-700">วันหมดอายุ: {expiryFormatted}</p>
            <p className="text-sm text-amber-700 mt-1">
              กรุณาต่ออายุภายใน <strong>{graceDaysRemaining} วัน</strong> เพื่อป้องกันการสูญเสียข้อมูล
            </p>
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function BillingPage() {
  const [step, setStep]             = useState<Step>('select')
  const [selectedPlan, setSelectedPlan] = useState('business')
  const [duration, setDuration]     = useState(1)
  const [slip, setSlip]             = useState<File | null>(null)
  const [copied, setCopied]         = useState<string | null>(null)

  const plan     = plans.find(p => p.id === selectedPlan)!
  const durOpt   = durationOptions.find(d => d.value === duration)!
  const base     = plan.price * duration
  const discount = Math.round(base * (durOpt.discount / 100))
  const total    = base - discount

  function copyText(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(text)
    setTimeout(() => setCopied(null), 2000)
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 pt-16 px-4">
        <div className="max-w-md w-full text-center">
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-100 flex items-center justify-center mb-6">
            <CheckCircle className="h-10 w-10 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">ส่งหลักฐานสำเร็จ!</h2>
          <p className="text-slate-500 mb-6">
            ทีมงานจะตรวจสอบและอนุมัติภายใน 1 ชั่วโมง (เวลาทำการ 09:00–18:00)
            <br />คุณจะได้รับอีเมลยืนยันเมื่ออนุมัติแล้ว
          </p>
          <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700 mb-8 text-left space-y-1">
            <p className="font-semibold">สรุปคำสั่งซื้อ</p>
            <p>แพ็กเกจ: {plan.name}</p>
            <p>ระยะเวลา: {duration} เดือน</p>
            <p>ยอดชำระ: ฿{formatPrice(total)}</p>
          </div>
          <Link href="/login" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition-colors">
            เข้าสู่ระบบ
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 pt-16">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12">

        <ExpiryAlert />

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 shadow-lg mb-4">
            <CreditCard className="h-7 w-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 mb-2">ต่ออายุ / ชำระค่าบริการ</h1>
          <p className="text-slate-500">เลือกแพ็กเกจและระยะเวลาที่ต้องการ</p>
        </div>

        {/* Progress */}
        <div className="flex items-center justify-center gap-4 mb-10">
          {(['select', 'pay', 'done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-4">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                step === s || (i < ['select','pay','done'].indexOf(step))
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-200 text-slate-400'
              }`}>{i + 1}</div>
              {i < 2 && <div className={`h-0.5 w-12 ${i < ['select','pay','done'].indexOf(step) ? 'bg-blue-400' : 'bg-slate-200'}`} />}
            </div>
          ))}
        </div>

        {step === 'select' && (
          <div className="space-y-6">
            {/* Plan selection */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-blue-600" />เลือกแพ็กเกจ
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {plans.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlan(p.id)}
                    className={`relative text-left rounded-xl border-2 p-4 transition-all ${
                      selectedPlan === p.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {p.popular && (
                      <span className="absolute -top-2.5 left-4 inline-flex items-center gap-1 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-white">
                        <Star className="h-3 w-3" />ยอดนิยม
                      </span>
                    )}
                    <p className="font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{p.branches}</p>
                    <p className="text-lg font-bold text-blue-600 mt-2">฿{formatPrice(p.price)}<span className="text-xs font-normal text-slate-400">/{p.period}</span></p>
                  </button>
                ))}
              </div>
            </div>

            {/* Duration */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4">ระยะเวลา</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {durationOptions.map(d => (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => setDuration(d.value)}
                    className={`rounded-xl border-2 py-3 text-center transition-all ${
                      duration === d.value
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-slate-900">{d.label}</p>
                    {d.discount > 0 && (
                      <p className="text-xs text-emerald-600 font-medium mt-0.5">ประหยัด {d.discount}%</p>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl p-6 text-white">
              <h2 className="font-semibold mb-4">สรุปคำสั่งซื้อ</h2>
              <div className="space-y-2 text-sm text-blue-100 mb-4">
                <div className="flex justify-between">
                  <span>แพ็กเกจ {plan.name} × {duration} เดือน</span>
                  <span>฿{formatPrice(base)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-emerald-300">
                    <span>ส่วนลด {durOpt.discount}%</span>
                    <span>-฿{formatPrice(discount)}</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between text-xl font-bold border-t border-white/20 pt-4">
                <span>ยอดรวม</span>
                <span>฿{formatPrice(total)}</span>
              </div>
            </div>

            <button
              onClick={() => setStep('pay')}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg"
            >
              ถัดไป — เลือกช่องทางชำระ <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {step === 'pay' && (
          <div className="space-y-6">
            <button onClick={() => setStep('select')} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" />กลับเลือกแพ็กเกจ
            </button>

            {/* Summary bar */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">{plan.name} · {duration} เดือน</p>
                <p className="text-xs text-blue-600">{durOpt.discount > 0 ? `ประหยัด ${durOpt.discount}%` : 'ราคาปกติ'}</p>
              </div>
              <p className="text-2xl font-bold text-blue-700">฿{formatPrice(total)}</p>
            </div>

            {/* QR */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 text-center">
              <div className="flex items-center gap-2 justify-center mb-4">
                <QrCode className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">PromptPay QR Code</h2>
              </div>
              <div className="mx-auto h-48 w-48 rounded-xl bg-slate-100 flex items-center justify-center border border-slate-200 mb-3">
                <div className="text-center">
                  <QrCode className="h-16 w-16 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400">QR สำหรับ ฿{formatPrice(total)}</p>
                </div>
              </div>
              <p className="text-xs text-slate-400">สแกนด้วย Mobile Banking ทุกธนาคาร</p>
            </div>

            {/* Bank accounts */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="h-5 w-5 text-blue-600" />
                <h2 className="text-lg font-semibold text-slate-900">โอนเงินผ่านธนาคาร</h2>
              </div>
              <div className="space-y-3">
                {bankAccounts.map(acc => (
                  <div key={acc.number} className="rounded-xl border border-slate-100 p-4 flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg ${acc.color} flex items-center justify-center shrink-0`}>
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{acc.bank}</p>
                      <p className="text-sm font-mono text-slate-600">{acc.number}</p>
                      <p className="text-xs text-slate-400">{acc.name}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyText(acc.number.replace(/-/g, ''))}
                      className="shrink-0 p-2 rounded-lg hover:bg-slate-100 transition-colors"
                      title="คัดลอกเลขบัญชี"
                    >
                      {copied === acc.number.replace(/-/g, '') ? (
                        <CheckCircle className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Copy className="h-5 w-5 text-slate-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Slip upload */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
                <Upload className="h-5 w-5 text-blue-600" />อัปโหลด Slip การชำระเงิน
              </h2>
              <label className="flex flex-col items-center justify-center w-full h-36 rounded-xl border-2 border-dashed border-slate-200 cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                {slip ? (
                  <div className="text-center">
                    <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
                    <p className="text-sm text-slate-700 font-medium">{slip.name}</p>
                    <p className="text-xs text-slate-400 mt-1">คลิกเพื่อเปลี่ยนไฟล์</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <Upload className="h-10 w-10 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-600">คลิกหรือลาก Slip มาวาง</p>
                    <p className="text-xs text-slate-400 mt-1">PNG, JPG, PDF</p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="sr-only"
                  onChange={e => setSlip(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <button
              onClick={() => slip && setStep('done')}
              disabled={!slip}
              className="w-full py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-base flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ส่งหลักฐานการชำระเงิน <ChevronRight className="h-5 w-5" />
            </button>
            <p className="text-center text-xs text-slate-400">ทีมงานจะอนุมัติภายใน 1 ชั่วโมง (เวลาทำการ)</p>
          </div>
        )}
      </div>
    </div>
  )
}
