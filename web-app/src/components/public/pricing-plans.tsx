'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle, Loader2, Star } from 'lucide-react'

interface PublicPlan {
  key: string
  name: string
  description?: string | null
  monthlyPrice: number | null
  custom: boolean
  branches: number | null
  storageGb: number | null
  modules: { key: string; name: string }[]
}

export interface PublicPlans {
  trial: { days: number; branches: number | null; modules: { key: string; name: string }[] }
  plans: PublicPlan[]
  terms: { months: number; discountPct: number }[]
}

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })

/** The plans as sold in the system: names, prices and features set by FixITPro in Super Admin */
export function usePublicPlans() {
  const [data, setData] = useState<PublicPlans | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    fetch('/api/v1/public/plans')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setData)
      .catch(() => setFailed(true))
  }, [])
  return { data, failed }
}

function PlanCard({ plan, highlight }: { plan: PublicPlan; highlight: boolean }) {
  const lines = [
    plan.branches == null ? 'สาขาไม่จำกัด' : `${plan.branches} สาขา`,
    'ผู้ใช้งานไม่จำกัด',
    ...(plan.storageGb != null ? [`พื้นที่เก็บรูป/ไฟล์ ${plan.storageGb} GB`] : []),
    ...plan.modules.map((m) => m.name),
  ]
  return (
    <div className={`relative rounded-2xl p-7 flex flex-col ${
      highlight
        ? 'bg-gradient-to-br from-blue-600 to-purple-700 text-white shadow-2xl shadow-blue-500/30'
        : 'bg-white border border-slate-200 shadow-sm'
    }`}>
      {highlight && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-1 text-xs font-bold text-white shadow-lg">
            <Star className="h-3 w-3" /> แนะนำ
          </span>
        </div>
      )}
      <div className="mb-5">
        <h3 className={`text-xl font-bold mb-1 ${highlight ? 'text-white' : 'text-slate-900'}`}>{plan.name}</h3>
        {plan.description && (
          <p className={`text-sm leading-relaxed ${highlight ? 'text-blue-100' : 'text-slate-500'}`}>{plan.description}</p>
        )}
      </div>
      <div className="flex items-baseline gap-1 mb-6 min-h-[2.5rem]">
        {plan.monthlyPrice != null ? (
          <>
            <span className="text-xs text-slate-400 mr-1">฿</span>
            <span className={`text-4xl font-bold tracking-tight ${highlight ? 'text-white' : 'text-slate-900'}`}>{fmt(plan.monthlyPrice)}</span>
            <span className={`text-sm ${highlight ? 'text-blue-200' : 'text-slate-400'}`}>/เดือน</span>
          </>
        ) : (
          <span className={`text-2xl font-bold ${highlight ? 'text-white' : 'text-slate-900'}`}>
            {plan.custom ? 'ราคาตามตกลง' : 'สอบถามราคา'}
          </span>
        )}
      </div>
      <Link
        href={plan.custom || plan.monthlyPrice == null ? '/contact' : '/register'}
        className={`block text-center py-3 rounded-xl font-semibold mb-7 transition-all ${
          highlight ? 'bg-white text-blue-700 hover:bg-blue-50' : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90'
        }`}
      >
        {plan.custom || plan.monthlyPrice == null ? 'ติดต่อทีมงาน' : 'เริ่มทดลองฟรี'}
      </Link>
      <ul className="space-y-2.5 flex-1">
        {lines.map((l) => (
          <li key={l} className={`flex items-center gap-2.5 text-sm ${highlight ? 'text-blue-100' : 'text-slate-700'}`}>
            <CheckCircle className={`h-4 w-4 shrink-0 ${highlight ? 'text-blue-300' : 'text-emerald-500'}`} />
            {l}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function PricingPlans() {
  const { data, failed } = usePublicPlans()
  if (failed) {
    return <p className="text-center text-slate-500">โหลดแพ็กเกจไม่สำเร็จ — ลองรีเฟรช หรือ <Link href="/contact" className="text-blue-600 underline">ติดต่อทีมงาน</Link></p>
  }
  if (!data) return <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-slate-400" /></div>
  // The middle plan is the one most shops pick
  const middle = data.plans.filter((p) => !p.custom)
  const highlightKey = middle.length >= 2 ? middle[Math.floor(middle.length / 2)].key : null
  const discounts = data.terms.filter((t) => t.discountPct > 0)
  const trialParts = [
    ...(data.trial.branches != null ? [`${data.trial.branches} สาขา`] : []),
    ...(data.trial.modules.length ? [data.trial.modules.map((m) => m.name).join(', ')] : []),
  ]
  return (
    <>
      <div className={`grid grid-cols-1 sm:grid-cols-2 gap-6 ${data.plans.length >= 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
        {data.plans.map((p) => <PlanCard key={p.key} plan={p} highlight={p.key === highlightKey} />)}
      </div>
      {discounts.length > 0 && (
        <p className="mt-8 text-center text-sm text-slate-600">
          จ่ายล่วงหน้าคุ้มกว่า: {discounts.map((t) => `${t.months} เดือน ลด ${t.discountPct}%`).join(' · ')}
        </p>
      )}
      <p className="mt-3 text-center text-sm text-slate-500">
        ทดลองใช้ฟรี {data.trial.days} วัน ไม่ต้องใช้บัตรเครดิต
        {trialParts.length > 0 && ` — ช่วงทดลอง: ${trialParts.join(' · ')}`}
      </p>
    </>
  )
}
