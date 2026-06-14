import type { Metadata } from 'next'
import Link from 'next/link'
import {
  CheckCircle, XCircle, ArrowRight, Star, Zap, Building2,
  Users, CreditCard, FileText, ArrowRightLeft,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'ราคาและแพ็กเกจ — FixITPro',
  description: 'แพ็กเกจ FixITPro ราคาโปร่งใส เหมาะสำหรับทุกขนาดร้าน ทดลองใช้ฟรี 30 วัน',
}

type Plan = {
  name: string
  price: string
  period: string
  desc: string
  badge?: string
  features: { label: string; included: boolean }[]
  cta: string
  highlight: boolean
}

const plans: Plan[] = [
  {
    name: 'Starter',
    price: '990',
    period: '/เดือน',
    desc: 'เหมาะสำหรับร้านมือถือขนาดเล็ก 1 สาขา',
    highlight: false,
    cta: 'เริ่มทดลองฟรี',
    features: [
      { label: '1 สาขา',               included: true },
      { label: 'ผู้ใช้งาน 3 คน',        included: true },
      { label: 'POS ขายสินค้า',         included: true },
      { label: 'จัดการงานซ่อม',         included: true },
      { label: 'สต็อกสินค้า',           included: true },
      { label: 'ฐานข้อมูลลูกค้า',       included: true },
      { label: 'รายงานพื้นฐาน',         included: true },
      { label: 'แจ้งเตือนในระบบ',       included: true },
      { label: 'Support ทางอีเมล',      included: true },
      { label: 'รายงานเชิงลึก',         included: false },
      { label: 'หลายสาขา',              included: false },
      { label: 'เปรียบเทียบสาขา',       included: false },
      { label: 'Support ทาง LINE',      included: false },
    ],
  },
  {
    name: 'Business',
    price: '1,990',
    period: '/เดือน',
    desc: 'สำหรับร้านที่เติบโต ต้องการฟีเจอร์ครบและ Support รวดเร็ว',
    badge: 'ยอดนิยม',
    highlight: true,
    cta: 'เริ่มทดลองฟรี',
    features: [
      { label: 'สูงสุด 3 สาขา',         included: true },
      { label: 'ผู้ใช้งานไม่จำกัด',     included: true },
      { label: 'POS ขายสินค้า',         included: true },
      { label: 'จัดการงานซ่อม',         included: true },
      { label: 'สต็อกสินค้า',           included: true },
      { label: 'ฐานข้อมูลลูกค้า',       included: true },
      { label: 'รายงานพื้นฐาน',         included: true },
      { label: 'แจ้งเตือนในระบบ',       included: true },
      { label: 'Support ทางอีเมล',      included: true },
      { label: 'รายงานเชิงลึก',         included: true },
      { label: 'หลายสาขา (3)',          included: true },
      { label: 'เปรียบเทียบสาขา',       included: false },
      { label: 'Support ทาง LINE',      included: true },
    ],
  },
  {
    name: 'Enterprise',
    price: '3,990',
    period: '/เดือน',
    desc: 'สำหรับธุรกิจหลายสาขา ต้องการข้อมูลรวมและ Dedicated Support',
    highlight: false,
    cta: 'เริ่มทดลองฟรี',
    features: [
      { label: 'สาขาไม่จำกัด',          included: true },
      { label: 'ผู้ใช้งานไม่จำกัด',     included: true },
      { label: 'POS ขายสินค้า',         included: true },
      { label: 'จัดการงานซ่อม',         included: true },
      { label: 'สต็อกสินค้า',           included: true },
      { label: 'ฐานข้อมูลลูกค้า',       included: true },
      { label: 'รายงานพื้นฐาน',         included: true },
      { label: 'แจ้งเตือนในระบบ',       included: true },
      { label: 'Support ทางอีเมล',      included: true },
      { label: 'รายงานเชิงลึก',         included: true },
      { label: 'หลายสาขา (ไม่จำกัด)',  included: true },
      { label: 'เปรียบเทียบสาขา',       included: true },
      { label: 'Dedicated Support LINE', included: true },
    ],
  },
  {
    name: 'Unlimited',
    price: '5,990',
    period: '/เดือน',
    desc: 'ทุกฟีเจอร์ ไม่จำกัด สำหรับเชนร้านมือถือขนาดใหญ่',
    highlight: false,
    cta: 'ติดต่อทีมงาน',
    features: [
      { label: 'สาขาไม่จำกัด',          included: true },
      { label: 'ผู้ใช้งานไม่จำกัด',     included: true },
      { label: 'ทุกฟีเจอร์ Enterprise',  included: true },
      { label: 'Custom Branding',        included: true },
      { label: 'API Access',            included: true },
      { label: 'Training Session',      included: true },
      { label: 'SLA Guarantee',         included: true },
      { label: 'Onboarding ส่วนตัว',    included: true },
      { label: 'รายงาน Custom',         included: true },
      { label: 'เปรียบเทียบสาขา',       included: true },
      { label: 'Priority Support 24/7', included: true },
      { label: 'ทดสอบฟีเจอร์ใหม่ก่อน', included: true },
      { label: 'Add-on ทุกตัว',         included: true },
    ],
  },
]

function PlanCard({ plan }: { plan: Plan }) {
  return (
    <div className={`relative rounded-2xl p-7 flex flex-col ${
      plan.highlight
        ? 'bg-gradient-to-br from-blue-600 to-purple-700 text-white shadow-2xl shadow-blue-500/30'
        : 'bg-white border border-slate-200 shadow-sm'
    }`}>
      {plan.badge && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 px-4 py-1 text-xs font-bold text-white shadow-lg">
            <Star className="h-3 w-3" /> {plan.badge}
          </span>
        </div>
      )}

      <div className="mb-5">
        <h3 className={`text-xl font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
          {plan.name}
        </h3>
        <p className={`text-sm leading-relaxed ${plan.highlight ? 'text-blue-100' : 'text-slate-500'}`}>
          {plan.desc}
        </p>
      </div>

      <div className="flex items-baseline gap-1 mb-6">
        <span className="text-xs text-slate-400 mr-1">฿</span>
        <span className={`text-4xl font-bold tracking-tight ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
          {plan.price}
        </span>
        <span className={`text-sm ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>{plan.period}</span>
      </div>

      <Link
        href={plan.cta === 'ติดต่อทีมงาน' ? '/contact' : '/register'}
        className={`block text-center py-3 rounded-xl font-semibold mb-7 transition-all ${
          plan.highlight
            ? 'bg-white text-blue-700 hover:bg-blue-50'
            : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:opacity-90'
        }`}
      >
        {plan.cta}
      </Link>

      <ul className="space-y-2.5 flex-1">
        {plan.features.map(f => (
          <li key={f.label} className={`flex items-center gap-2.5 text-sm ${
            plan.highlight
              ? f.included ? 'text-blue-100' : 'text-blue-300/50 line-through'
              : f.included ? 'text-slate-700' : 'text-slate-300 line-through'
          }`}>
            {f.included
              ? <CheckCircle className={`h-4 w-4 shrink-0 ${plan.highlight ? 'text-blue-300' : 'text-emerald-500'}`} />
              : <XCircle className="h-4 w-4 shrink-0 text-slate-200" />
            }
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-16 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-20 right-0 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-purple-600/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 mb-6">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-sm text-blue-300 font-medium">ราคาโปร่งใส ไม่มีค่าใช้จ่ายซ่อน</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            เลือกแพ็กเกจที่เหมาะกับร้านคุณ
          </h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto">
            ทดลองใช้ฟรี 30 วัน ทุกแพ็กเกจ ไม่ต้องใช้บัตรเครดิต
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 lg:py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
            {plans.map(plan => (
              <PlanCard key={plan.name} plan={plan} />
            ))}
          </div>
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-14 bg-white border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Add-on เสริม (เร็วๆ นี้)</h2>
            <p className="text-slate-500">ซื้อเพิ่มแยกต่างหาก เฉพาะสิ่งที่คุณต้องการ</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users,          label: 'HR Module',      price: '+฿490/เดือน' },
              { icon: FileText,       label: 'Accounting',     price: '+฿690/เดือน' },
              { icon: CreditCard,     label: 'LINE OA',        price: '+฿390/เดือน' },
              { icon: ArrowRightLeft, label: 'Telegram Bot',   price: '+฿290/เดือน' },
            ].map(a => (
              <div key={a.label} className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                <a.icon className="h-8 w-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 mb-1">{a.label}</p>
                <p className="text-xs text-blue-600 font-medium">{a.price}</p>
                <span className="inline-block mt-2 text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">เร็วๆ นี้</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 bg-slate-50">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">คำถามที่พบบ่อย</h2>
          <div className="space-y-5">
            {[
              { q: 'ทดลองฟรีนานแค่ไหน?', a: 'ทดลองใช้ฟรี 30 วันเต็ม ทุกแพ็กเกจ ไม่มีข้อจำกัดฟีเจอร์ ไม่ต้องใส่ข้อมูลบัตรเครดิต' },
              { q: 'ถ้าต้องการเปลี่ยนแพ็กเกจทำอย่างไร?', a: 'เปลี่ยนได้ทุกเมื่อ ไม่มีค่าใช้จ่ายเพิ่มเติม ยอดที่จ่ายไปแล้วจะคำนวณตามสัดส่วน' },
              { q: 'ชำระเงินอย่างไร?', a: 'โอนผ่านธนาคาร พร้อมเพย์ หรือ QR Code ส่ง Slip มาแล้วทีมงานอนุมัติภายใน 1 ชั่วโมง (เวลาทำการ)' },
              { q: 'ข้อมูลปลอดภัยหรือไม่?', a: 'ข้อมูลทั้งหมดเข้ารหัส สำรองข้อมูลอัตโนมัติทุกวัน เก็บบน Server ที่ปลอดภัย' },
            ].map(faq => (
              <div key={faq.q} className="rounded-xl bg-white border border-slate-100 p-6">
                <h3 className="font-semibold text-slate-900 mb-2">{faq.q}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-700">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">ยังไม่แน่ใจ? ทดลองใช้ฟรีก่อนได้เลย</h2>
          <p className="text-blue-100 mb-8">30 วัน เต็ม ฟีเจอร์ครบ ยกเลิกได้ทุกเมื่อ</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-700 font-bold text-lg hover:bg-blue-50 transition-colors"
            >
              ทดลองใช้ฟรี 30 วัน <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/30 text-white font-semibold text-lg hover:bg-white/10 transition-colors"
            >
              สอบถามทีมงาน
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
