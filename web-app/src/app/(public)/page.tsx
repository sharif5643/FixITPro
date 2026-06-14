import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Wrench, ShoppingCart, Package, Users, BarChart2, Building2,
  Bell, CheckCircle, ArrowRight, Star, Zap, Shield, Clock,
  TrendingUp, Smartphone,
} from 'lucide-react'

export const metadata: Metadata = {
  title: 'FixITPro — ระบบจัดการร้านมือถือครบวงจร',
  description: 'ระบบ POS ขาย ซ่อม สต็อก ลูกค้า รายงาน หลายสาขา สำหรับร้านมือถือไทย ทดลองใช้ฟรี 30 วัน',
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950">
      {/* Background orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-[600px] w-[600px] rounded-full bg-blue-600/20 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-[600px] w-[600px] rounded-full bg-purple-600/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[400px] w-[400px] rounded-full bg-indigo-600/10 blur-3xl" />
      </div>

      {/* Grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.3) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.3) 1px,transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-32 pb-20">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-500/10 border border-blue-500/20 px-4 py-1.5 mb-8">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-sm text-blue-300 font-medium">ระบบใหม่ 2026 — Modern SaaS สำหรับร้านมือถือไทย</span>
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight tracking-tight mb-6">
            จัดการร้านมือถือ
            <br />
            <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              ครบวงจร ในระบบเดียว
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-slate-400 max-w-2xl mx-auto mb-10 leading-relaxed">
            ขาย ซ่อม สต็อก ลูกค้า รายงาน หลายสาขา — ทุกอย่างอยู่ใน FixITPro
            <br />
            <span className="text-slate-500">ออกแบบเพื่อร้านมือถือไทยโดยเฉพาะ</span>
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-semibold text-lg shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:opacity-90 transition-all"
            >
              ทดลองใช้ฟรี 30 วัน
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 text-white font-semibold text-lg hover:bg-white/5 transition-all"
            >
              ดูฟีเจอร์ทั้งหมด
            </Link>
          </div>

          {/* Trust signals */}
          <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-slate-500">
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              ไม่ต้องใช้บัตรเครดิต
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              ยกเลิกได้ทุกเมื่อ
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
              รองรับ SUNMI POS
            </span>
          </div>
        </div>

        {/* Dashboard preview mockup */}
        <div className="mt-16 relative max-w-5xl mx-auto">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent z-10 pointer-events-none rounded-2xl" />
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-1 shadow-2xl shadow-black/50">
            <div className="rounded-xl bg-slate-800/80 overflow-hidden">
              {/* Mock header bar */}
              <div className="flex items-center gap-2 px-4 py-3 bg-slate-900/60 border-b border-white/5">
                <div className="flex gap-1.5">
                  <div className="h-3 w-3 rounded-full bg-red-500/70" />
                  <div className="h-3 w-3 rounded-full bg-yellow-500/70" />
                  <div className="h-3 w-3 rounded-full bg-emerald-500/70" />
                </div>
                <div className="flex-1 mx-4 h-6 rounded-md bg-slate-700/50 flex items-center px-3">
                  <span className="text-xs text-slate-500">app.fixitpro.th/dashboard</span>
                </div>
              </div>
              {/* Mock dashboard */}
              <div className="p-4 space-y-4">
                {/* Stat cards row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'รายรับวันนี้', value: '฿28,450', color: 'from-emerald-500/20 to-emerald-500/5', accent: 'text-emerald-400' },
                    { label: 'งานซ่อม', value: '14 ใบงาน', color: 'from-orange-500/20 to-orange-500/5', accent: 'text-orange-400' },
                    { label: 'กำไรสุทธิ', value: '฿12,300', color: 'from-blue-500/20 to-blue-500/5', accent: 'text-blue-400' },
                    { label: 'แจ้งเตือน', value: '3 รายการ', color: 'from-red-500/20 to-red-500/5', accent: 'text-red-400' },
                  ].map(s => (
                    <div key={s.label} className={`rounded-xl bg-gradient-to-br ${s.color} border border-white/5 p-3`}>
                      <p className="text-xs text-slate-400">{s.label}</p>
                      <p className={`text-lg font-bold mt-1 ${s.accent}`}>{s.value}</p>
                    </div>
                  ))}
                </div>
                {/* Chart placeholder */}
                <div className="rounded-xl bg-white/5 border border-white/5 p-4 h-32 flex items-end gap-1.5">
                  {[40, 65, 45, 80, 55, 90, 70].map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1">
                      <div
                        className="w-full rounded-t-sm bg-gradient-to-t from-blue-600 to-purple-500 opacity-80"
                        style={{ height: `${h}%` }}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function Stats() {
  const stats = [
    { value: '500+', label: 'ร้านที่ใช้งาน' },
    { value: '2M+',  label: 'รายการขาย' },
    { value: '99.9%', label: 'Uptime' },
    { value: '24h',  label: 'Support Response' },
  ]
  return (
    <section className="bg-gradient-to-r from-blue-600 to-purple-700 py-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center text-white">
          {stats.map(s => (
            <div key={s.label}>
              <div className="text-3xl sm:text-4xl font-bold mb-1">{s.value}</div>
              <div className="text-blue-100 text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Features overview ─────────────────────────────────────────────────────────

function FeaturesOverview() {
  const features = [
    {
      icon: ShoppingCart,
      title: 'POS ขายสินค้า',
      desc: 'ระบบขายหน้าร้านที่รวดเร็ว รองรับบาร์โค้ด ส่วนลด หลายช่องทางชำระ',
      color: 'bg-blue-500',
    },
    {
      icon: Wrench,
      title: 'จัดการงานซ่อม',
      desc: 'ติดตามสถานะซ่อมครบทุกขั้นตอน แจ้งเตือนลูกค้าอัตโนมัติ พิมพ์ใบงาน',
      color: 'bg-orange-500',
    },
    {
      icon: Package,
      title: 'ควบคุมสต็อก',
      desc: 'นับสต็อก เติมสินค้า แจ้งเตือนสินค้าใกล้หมด รองรับหลายสาขา',
      color: 'bg-purple-500',
    },
    {
      icon: Users,
      title: 'ฐานข้อมูลลูกค้า',
      desc: 'บันทึกประวัติลูกค้า ประวัติซ่อม การรับประกัน ยอดค้างชำระ',
      color: 'bg-emerald-500',
    },
    {
      icon: BarChart2,
      title: 'รายงานเชิงลึก',
      desc: 'วิเคราะห์รายรับ กำไร สินค้าขายดี ประสิทธิภาพช่าง รายงาน PDF',
      color: 'bg-teal-500',
    },
    {
      icon: Building2,
      title: 'หลายสาขา',
      desc: 'จัดการทุกสาขาในที่เดียว โอนสต็อกระหว่างสาขา ดูรายงานรวม',
      color: 'bg-indigo-500',
    },
  ]

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-4 py-1.5 mb-6">
            <Zap className="h-3.5 w-3.5 text-blue-600" />
            <span className="text-sm text-blue-700 font-medium">ฟีเจอร์หลัก</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            ทุกสิ่งที่ร้านมือถือต้องการ
          </h2>
          <p className="text-lg text-slate-500 max-w-2xl mx-auto">
            ออกแบบมาเพื่อร้านมือถือโดยเฉพาะ ไม่ใช่ซอฟต์แวร์ทั่วไปที่ดัดแปลงมา
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(f => (
            <div
              key={f.title}
              className="group rounded-2xl border border-slate-100 bg-white p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200"
            >
              <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${f.color} mb-4 shadow-lg`}>
                <f.icon className="h-6 w-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-12">
          <Link
            href="/features"
            className="inline-flex items-center gap-2 text-blue-600 font-semibold hover:gap-3 transition-all"
          >
            ดูฟีเจอร์ทั้งหมด <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Workflow ──────────────────────────────────────────────────────────────────

function Workflow() {
  const steps = [
    {
      step: '01',
      title: 'สมัครและตั้งค่าร้าน',
      desc: 'สมัครฟรี 30 วัน ตั้งชื่อร้าน เพิ่มสินค้า เพิ่มพนักงาน พร้อมใช้งานทันที',
      icon: Smartphone,
    },
    {
      step: '02',
      title: 'ขายและซ่อมทุกวัน',
      desc: 'เปิดกะ รับออเดอร์ซ่อม ขายสินค้า POS อัปเดตสถานะ แจ้งเตือนลูกค้า',
      icon: Wrench,
    },
    {
      step: '03',
      title: 'ดูรายงาน วิเคราะห์ธุรกิจ',
      desc: 'ดูยอดขาย กำไร สินค้าขายดี ประสิทธิภาพช่าง วางแผนธุรกิจอย่างมืออาชีพ',
      icon: TrendingUp,
    },
  ]

  return (
    <section className="py-20 lg:py-28 bg-slate-50">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            เริ่มต้นง่าย ใช้งานได้เลย
          </h2>
          <p className="text-lg text-slate-500 max-w-xl mx-auto">
            ไม่ต้องมีความรู้ IT พิเศษ ตั้งค่าเสร็จใน 30 นาที
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-14 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-blue-300 to-purple-300" />

          {steps.map((s, i) => (
            <div key={s.step} className="relative text-center">
              <div className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl mb-5 shadow-lg ${
                i === 0 ? 'bg-blue-600' : i === 1 ? 'bg-purple-600' : 'bg-indigo-600'
              }`}>
                <s.icon className="h-8 w-8 text-white" />
                <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-white border-2 border-blue-600 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-blue-600">{i + 1}</span>
                </div>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">{s.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Pricing preview ───────────────────────────────────────────────────────────

function PricingPreview() {
  const plans = [
    {
      name: 'Starter',
      price: '990',
      desc: 'เหมาะสำหรับร้านขนาดเล็ก 1 สาขา',
      features: ['1 สาขา', 'POS + ซ่อม + สต็อก', 'รายงานพื้นฐาน', 'Support ทางอีเมล'],
      highlight: false,
    },
    {
      name: 'Business',
      price: '1,990',
      desc: 'ยอดนิยม สำหรับร้านที่กำลังเติบโต',
      features: ['3 สาขา', 'ทุกฟีเจอร์ใน Starter', 'รายงานเชิงลึก', 'แจ้งเตือนอัตโนมัติ', 'Support ทาง LINE'],
      highlight: true,
    },
    {
      name: 'Enterprise',
      price: '3,990',
      desc: 'สำหรับธุรกิจหลายสาขา',
      features: ['ไม่จำกัดสาขา', 'ทุกฟีเจอร์ใน Business', 'เปรียบเทียบสาขา', 'Dedicated Support'],
      highlight: false,
    },
  ]

  return (
    <section className="py-20 lg:py-28 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
            ราคาโปร่งใส ไม่มีค่าใช้จ่ายซ่อน
          </h2>
          <p className="text-lg text-slate-500">ทดลองใช้ฟรี 30 วัน ทุกแพ็กเกจ</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          {plans.map(plan => (
            <div
              key={plan.name}
              className={`rounded-2xl p-6 ${
                plan.highlight
                  ? 'bg-gradient-to-br from-blue-600 to-purple-700 text-white shadow-2xl shadow-blue-500/30 scale-105'
                  : 'border border-slate-200 bg-white'
              }`}
            >
              {plan.highlight && (
                <div className="inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-xs font-medium mb-4">
                  <Star className="h-3 w-3" /> ยอดนิยม
                </div>
              )}
              <h3 className={`text-lg font-bold mb-1 ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>
                {plan.name}
              </h3>
              <p className={`text-sm mb-4 ${plan.highlight ? 'text-blue-100' : 'text-slate-500'}`}>{plan.desc}</p>
              <div className="flex items-baseline gap-1 mb-6">
                <span className={`text-3xl font-bold ${plan.highlight ? 'text-white' : 'text-slate-900'}`}>฿{plan.price}</span>
                <span className={`text-sm ${plan.highlight ? 'text-blue-200' : 'text-slate-400'}`}>/เดือน</span>
              </div>
              <ul className="space-y-2.5 mb-8">
                {plan.features.map(f => (
                  <li key={f} className={`flex items-center gap-2 text-sm ${plan.highlight ? 'text-blue-100' : 'text-slate-600'}`}>
                    <CheckCircle className={`h-4 w-4 shrink-0 ${plan.highlight ? 'text-blue-300' : 'text-emerald-500'}`} />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/register"
                className={`block text-center py-2.5 rounded-xl font-semibold text-sm transition-all ${
                  plan.highlight
                    ? 'bg-white text-blue-700 hover:bg-blue-50'
                    : 'border border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                เริ่มทดลองฟรี
              </Link>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/pricing" className="inline-flex items-center gap-2 text-blue-600 font-semibold hover:gap-3 transition-all">
            ดูรายละเอียดแพ็กเกจทั้งหมด <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Why FixITPro ──────────────────────────────────────────────────────────────

function WhyFixITPro() {
  const reasons = [
    { icon: Zap,       title: 'เร็ว ไม่สะดุด',        desc: 'ออกแบบมาให้ใช้งานได้รวดเร็ว แม้ internet ช้า รองรับ Offline บางฟีเจอร์' },
    { icon: Shield,    title: 'ปลอดภัย',              desc: 'ข้อมูลลูกค้าและยอดขายปลอดภัย สำรองข้อมูลอัตโนมัติ' },
    { icon: Smartphone,title: 'รองรับ SUNMI POS',     desc: 'ทำงานได้บน SUNMI T2, T1 mini และอุปกรณ์ POS ทั่วไป' },
    { icon: Clock,     title: 'Support ตอบเร็ว',      desc: 'ทีม Support พร้อมช่วยเหลือทาง LINE ตอบภายใน 24 ชั่วโมง' },
    { icon: Bell,      title: 'แจ้งเตือนอัตโนมัติ',  desc: 'แจ้งเตือนงานซ่อมเกินกำหนด สินค้าใกล้หมด ลูกค้าค้างชำระ' },
    { icon: TrendingUp,title: 'อัปเดตต่อเนื่อง',     desc: 'พัฒนาฟีเจอร์ใหม่ตามความต้องการของร้านมือถือไทยทุกเดือน' },
  ]

  return (
    <section className="py-20 lg:py-28 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl" />
        <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-purple-600/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            ทำไมต้องเลือก FixITPro?
          </h2>
          <p className="text-slate-400 text-lg max-w-xl mx-auto">
            ไม่ใช่แค่ซอฟต์แวร์ แต่คือพาร์ทเนอร์ที่เข้าใจธุรกิจร้านมือถือ
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {reasons.map(r => (
            <div key={r.title} className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-6 hover:bg-white/10 transition-colors">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/20 mb-4">
                <r.icon className="h-5 w-5 text-blue-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">{r.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CtaSection() {
  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
          พร้อมยกระดับร้านมือถือของคุณ?
        </h2>
        <p className="text-lg text-slate-500 mb-10">
          เริ่มต้นทดลองใช้ฟรี 30 วัน ไม่ต้องใช้บัตรเครดิต ยกเลิกได้ทุกเมื่อ
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold text-lg shadow-2xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:opacity-90 transition-all"
          >
            ทดลองใช้ฟรี 30 วัน
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/contact"
            className="inline-flex items-center justify-center gap-2 px-10 py-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-lg hover:bg-slate-50 transition-all"
          >
            ติดต่อสอบถาม
          </Link>
        </div>
      </div>
    </section>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <Hero />
      <Stats />
      <FeaturesOverview />
      <Workflow />
      <PricingPreview />
      <WhyFixITPro />
      <CtaSection />
    </>
  )
}
