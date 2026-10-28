import type { Metadata } from 'next'
import Link from 'next/link'
import {
  ArrowRight, Zap, Users, FileText, ArrowRightLeft, Bell,
} from 'lucide-react'
import { PricingPlans } from '@/components/public/pricing-plans'

export const metadata: Metadata = {
  title: 'ราคาและแพ็กเกจ — FixITPro',
  description: 'แพ็กเกจ FixITPro ราคาโปร่งใส เหมาะสำหรับทุกขนาดร้าน ทดลองใช้ฟรี 14 วัน',
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
            ทดลองใช้ฟรี 14 วัน ไม่ต้องใช้บัตรเครดิต
          </p>
        </div>
      </section>

      {/* Plans */}
      <section className="py-16 lg:py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Names, prices and features come from the system (Super Admin → แพ็กเกจ) */}
          <PricingPlans />
        </div>
      </section>

      {/* Add-ons */}
      <section className="py-14 bg-white border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">กำลังพัฒนา (เร็วๆ นี้)</h2>
            <p className="text-slate-500">ฟีเจอร์ที่ยังไม่มีในระบบ เปิดให้ใช้เมื่อพร้อม</p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { icon: Users,          label: 'HR & พนักงาน',    desc: 'เวลางาน ลางาน เงินเดือน' },
              { icon: FileText,       label: 'ภาษีมูลค่าเพิ่ม', desc: 'รายงานภาษีซื้อ-ภาษีขาย' },
              { icon: ArrowRightLeft, label: 'ขายแบบ Offline',   desc: 'ขายต่อได้ตอนเน็ตหลุด' },
              { icon: Bell,           label: 'SMS แจ้งลูกค้า',   desc: 'แจ้งสถานะซ่อมทาง SMS' },
            ].map(a => (
              <div key={a.label} className="rounded-xl border border-dashed border-slate-200 p-5 text-center">
                <a.icon className="h-8 w-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-semibold text-slate-700 mb-1">{a.label}</p>
                <p className="text-xs text-slate-500">{a.desc}</p>
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
              { q: 'ทดลองฟรีนานแค่ไหน?', a: 'ทดลองใช้ฟรี 14 วัน ใช้ฟีเจอร์หลักได้ทันที ไม่ต้องใส่ข้อมูลบัตรเครดิต' },
              { q: 'ถ้าต้องการเปลี่ยนแพ็กเกจทำอย่างไร?', a: 'เลือกแพ็กเกจใหม่ตอนต่ออายุในหน้า "ต่ออายุ" ของร้าน แพ็กเกจใหม่มีผลเมื่อทีมงานยืนยันการชำระเงิน ข้อมูลร้านไม่หายเมื่อเปลี่ยนแพ็กเกจ' },
              { q: 'จ่ายล่วงหน้าได้ส่วนลดไหม?', a: 'ได้ จ่าย 3 เดือนลด 5% · 6 เดือนลด 10% · 12 เดือนลด 20%' },
              { q: 'ชำระเงินอย่างไร?', a: 'โอนผ่านธนาคารหรือพร้อมเพย์ แล้วแนบสลิปในหน้าต่ออายุ ทีมงานตรวจและเปิดใช้งานให้' },
              { q: 'ข้อมูลปลอดภัยหรือไม่?', a: 'รับส่งข้อมูลแบบเข้ารหัส (HTTPS) รหัสผ่านเก็บแบบเข้ารหัส สำรองข้อมูลอัตโนมัติทุกวัน และเจ้าของร้านสำรองข้อมูลร้านเองได้' },
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
          <p className="text-blue-100 mb-8">ทดลองฟรี 14 วัน ไม่ต้องใช้บัตรเครดิต</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/register"
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-700 font-bold text-lg hover:bg-blue-50 transition-colors"
            >
              ทดลองใช้ฟรี 14 วัน <ArrowRight className="h-5 w-5" />
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
