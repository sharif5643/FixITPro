import type { Metadata } from 'next'
import Link from 'next/link'
import { MessageCircle, Facebook, Phone, Mail, Clock, MapPin, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'ติดต่อเรา — FixITPro',
  description: 'ติดต่อทีม FixITPro ผ่าน LINE, Facebook, โทรศัพท์ หรืออีเมล',
}

const contacts = [
  {
    icon: MessageCircle,
    title: 'LINE Official',
    value: '@fixitpro',
    desc: 'ช่องทางหลัก ตอบเร็วที่สุด · 09:00–20:00',
    action: 'เพิ่มเพื่อน LINE',
    href: 'https://line.me/R/ti/p/@fixitpro',
    color: 'bg-emerald-500',
    hoverColor: 'hover:bg-emerald-600',
    external: true,
  },
  {
    icon: Facebook,
    title: 'Facebook',
    value: 'FixITPro Thailand',
    desc: 'ข่าวสาร อัปเดตฟีเจอร์ใหม่',
    action: 'ติดต่อทาง Facebook',
    href: 'https://facebook.com/fixitpro',
    color: 'bg-blue-600',
    hoverColor: 'hover:bg-blue-700',
    external: true,
  },
  {
    icon: Phone,
    title: 'โทรศัพท์',
    value: '02-xxx-xxxx',
    desc: 'วันจันทร์–ศุกร์ 09:00–18:00 น.',
    action: 'โทรหาเรา',
    href: 'tel:02xxxxxxx',
    color: 'bg-violet-500',
    hoverColor: 'hover:bg-violet-600',
    external: false,
  },
  {
    icon: Mail,
    title: 'อีเมล',
    value: 'support@fixitpro.app',
    desc: 'ตอบกลับภายใน 24 ชั่วโมง',
    action: 'ส่งอีเมล',
    href: 'mailto:support@fixitpro.app',
    color: 'bg-rose-500',
    hoverColor: 'hover:bg-rose-600',
    external: false,
  },
]

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-28 pb-16 bg-gradient-to-br from-slate-900 via-blue-950 to-purple-950 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 right-0 h-96 w-96 rounded-full bg-blue-600/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">ติดต่อเรา</h1>
          <p className="text-xl text-slate-400 max-w-xl mx-auto">
            ทีมงานพร้อมช่วยเหลือคุณ เลือกช่องทางที่สะดวก
          </p>
        </div>
      </section>

      {/* Contact cards */}
      <section className="py-16 lg:py-24 bg-slate-50">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {contacts.map(c => (
              <div key={c.title} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-7 hover:shadow-md transition-shadow">
                <div className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl ${c.color} mb-5 shadow-lg`}>
                  <c.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">{c.title}</h3>
                <p className="text-blue-600 font-semibold mb-2">{c.value}</p>
                <p className="text-sm text-slate-500 mb-5">{c.desc}</p>
                <a
                  href={c.href}
                  target={c.external ? '_blank' : undefined}
                  rel={c.external ? 'noopener noreferrer' : undefined}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl ${c.color} ${c.hoverColor} text-white text-sm font-semibold transition-colors`}
                >
                  {c.action} <ArrowRight className="h-4 w-4" />
                </a>
              </div>
            ))}
          </div>

          {/* Office hours */}
          <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <h3 className="font-semibold text-slate-900">เวลาทำการ</h3>
              </div>
              <div className="space-y-2 text-sm text-slate-600">
                <div className="flex justify-between">
                  <span>วันจันทร์–ศุกร์</span>
                  <span className="font-medium">09:00–18:00</span>
                </div>
                <div className="flex justify-between">
                  <span>วันเสาร์</span>
                  <span className="font-medium">09:00–14:00</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>วันอาทิตย์ / วันหยุด</span>
                  <span>ปิด</span>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <MapPin className="h-5 w-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-slate-900">ที่ตั้งบริษัท</h3>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed">
                บริษัท ฟิกซ์ไอที จำกัด<br />
                กรุงเทพมหานคร 10100<br />
                <span className="text-slate-400 text-xs">*สำหรับการนัดหมายล่วงหน้าเท่านั้น</span>
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 bg-gradient-to-r from-blue-600 to-purple-700">
        <div className="mx-auto max-w-3xl px-4 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">พร้อมเริ่มทดลองใช้?</h2>
          <p className="text-blue-100 mb-8">สมัครฟรี 30 วัน ไม่ต้องรอ ไม่ต้องนัด</p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-white text-blue-700 font-bold text-lg hover:bg-blue-50 transition-colors"
          >
            ทดลองใช้ฟรี 30 วัน <ArrowRight className="h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  )
}
